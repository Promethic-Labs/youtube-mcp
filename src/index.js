import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API = "https://www.googleapis.com/youtube/v3";
const RAW_KEY = (process.env.YOUTUBE_API_KEY || "").trim();
const KEY = RAW_KEY.startsWith("${") ? "" : RAW_KEY; // unset optional config can arrive as a literal placeholder
const log = (...a) => console.error("[youtube-mcp]", ...a); // stderr only; stdout is the MCP channel

// ---------- helpers ----------

async function yt(endpoint, params) {
  if (!KEY) {
    throw new Error("No YouTube API key set. Add one in Claude Desktop > Settings > Extensions > YouTube. (Transcript tools work without it.)");
  }
  const url = new URL(`${API}/${endpoint}`);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  url.searchParams.set("key", KEY);
  const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`YouTube API ${data?.error?.code ?? r.status}: ${data?.error?.message ?? r.statusText}`);
  return data;
}

function videoId(v) {
  const m = String(v).match(/(?:v=|youtu\.be\/|shorts\/|embed\/|live\/)([\w-]{11})/);
  return m ? m[1] : String(v).trim();
}

function fmtVideo(it) {
  const s = it.snippet ?? {}, st = it.statistics ?? {}, cd = it.contentDetails ?? {};
  return {
    id: typeof it.id === "string" ? it.id : it.id?.videoId,
    title: s.title, channel: s.channelTitle, channelId: s.channelId, publishedAt: s.publishedAt,
    duration: cd.duration, views: st.viewCount, likes: st.likeCount, comments: st.commentCount,
    tags: (s.tags ?? []).slice(0, 15),
    description: (s.description ?? "").slice(0, 1000),
  };
}

const ts = (sec) => {
  const s = Math.floor(sec), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const p = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${p(m)}:${p(r)}` : `${m}:${p(r)}`;
};

const ok = (data) => ({ content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });
const fail = (e) => ({ isError: true, content: [{ type: "text", text: String(e?.message ?? e) }] });
const safe = (fn) => async (args) => { try { return ok(await fn(args)); } catch (e) { log(e); return fail(e); } };

// ---------- transcripts (no API key, runs from the user's own IP) ----------

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const decode = (s) => s
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));

async function captionTracks(vid) {
  let cookie = "";
  const getHtml = async () => {
    const r = await fetch(`https://www.youtube.com/watch?v=${vid}`, {
      headers: { "Accept-Language": "en-US", "User-Agent": UA, ...(cookie && { Cookie: cookie }) },
      signal: AbortSignal.timeout(20000),
    });
    return r.text();
  };
  let html = await getHtml();
  if (html.includes('action="https://consent.youtube.com/s"')) { // EU consent wall
    const v = html.match(/name="v" value="(.*?)"/)?.[1];
    if (v) { cookie = `CONSENT=YES+${v}`; html = await getHtml(); }
  }
  const apiKey = html.match(/"INNERTUBE_API_KEY":\s*"([\w-]+)"/)?.[1];
  if (!apiKey) {
    if (html.includes('class="g-recaptcha"')) throw new Error("YouTube is rate-limiting this IP (captcha). Wait a while and try again.");
    throw new Error("Couldn't read the YouTube page for this video.");
  }
  const r = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept-Language": "en-US", ...(cookie && { Cookie: cookie }) },
    body: JSON.stringify({ context: { client: { clientName: "ANDROID", clientVersion: "20.10.38" } }, videoId: vid }),
    signal: AbortSignal.timeout(20000),
  });
  const data = await r.json();
  const ps = data.playabilityStatus;
  if (ps?.status && ps.status !== "OK") throw new Error(`Video not playable: ${ps.reason ?? ps.status}`);
  const cap = data.captions?.playerCaptionsTracklistRenderer;
  if (!cap?.captionTracks?.length) throw new Error("This video has no captions/transcripts available.");
  return {
    tracks: cap.captionTracks.map((c) => ({
      language: c.name?.runs?.[0]?.text ?? c.name?.simpleText ?? c.languageCode,
      code: c.languageCode,
      auto_generated: c.kind === "asr",
      translatable: !!c.isTranslatable,
      url: c.baseUrl.replace("&fmt=srv3", ""),
    })),
    translationLanguages: (cap.translationLanguages ?? []).map((t) => t.languageCode),
  };
}

function pickTrack(tracks, languages) {
  // For each preferred language: exact manual > regional manual (en -> en-CA) > exact auto > regional auto
  const base = (c) => c.toLowerCase().split("-")[0];
  for (const lang of languages) {
    const l = lang.toLowerCase();
    const exact = (t) => t.code.toLowerCase() === l;
    const family = (t) => base(t.code) === base(l);
    const hit =
      tracks.find((t) => exact(t) && !t.auto_generated) ??
      tracks.find((t) => family(t) && !t.auto_generated) ??
      tracks.find(exact) ??
      tracks.find(family);
    if (hit) return hit;
  }
  return tracks.find((t) => !t.auto_generated) ?? tracks[0];
}

async function fetchSnippets(url) {
  const r = await fetch(url, { headers: { "Accept-Language": "en-US" }, signal: AbortSignal.timeout(20000) });
  const xml = await r.text();
  const out = [];
  for (const m of xml.matchAll(/<text start="([\d.]+)"(?: dur="([\d.]+)")?[^>]*>([\s\S]*?)<\/text>/g)) {
    const text = decode(decode(m[3])).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (text) out.push({ start: +m[1], duration: +(m[2] ?? 0), text });
  }
  if (!out.length) throw new Error("Transcript came back empty. YouTube may have blocked the request; try again shortly.");
  return out;
}

// ---------- server ----------

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

const server = new McpServer({ name: "youtube", version: typeof __VERSION__ !== "undefined" ? __VERSION__ : "dev" });

server.registerTool("search", {
  title: "Search YouTube",
  annotations: { title: "Search YouTube", ...READ_ONLY },
  description: "Search YouTube for videos, channels or playlists by keyword, with optional filters for date, region, channel and sort order. Uses 100 of the 10,000 daily YouTube API quota units per call (other tools use about 1).",
  inputSchema: {
    query: z.string(),
    type: z.enum(["video", "channel", "playlist"]).default("video"),
    max_results: z.number().int().min(1).max(50).default(10),
    order: z.enum(["relevance", "date", "viewCount", "rating"]).default("relevance"),
    published_after: z.string().optional().describe("RFC3339, e.g. 2026-01-01T00:00:00Z"),
    region_code: z.string().optional().describe("e.g. AU, US"),
    channel_id: z.string().optional(),
  },
}, safe(async (a) => {
  const d = await yt("search", {
    part: "snippet", q: a.query, type: a.type, order: a.order, maxResults: a.max_results,
    publishedAfter: a.published_after, regionCode: a.region_code, channelId: a.channel_id,
  });
  return (d.items ?? []).map((it) => ({
    kind: it.id.kind.split("#").pop(),
    id: it.id.videoId ?? it.id.channelId ?? it.id.playlistId,
    title: it.snippet.title, channel: it.snippet.channelTitle,
    publishedAt: it.snippet.publishedAt, description: it.snippet.description,
  }));
}));

async function getVideos(videos) {
  const d = await yt("videos", { part: "snippet,statistics,contentDetails", id: videos.slice(0, 50).map(videoId).join(",") });
  return (d.items ?? []).map(fmtVideo);
}

server.registerTool("get_videos", {
  title: "Get video details",
  annotations: { title: "Get video details", ...READ_ONLY },
  description: "Full details and stats for up to 50 videos (IDs or URLs). 1 quota unit.",
  inputSchema: { videos: z.array(z.string()).min(1).max(50) },
}, safe(({ videos }) => getVideos(videos)));

async function getChannel(channel) {
  const params = channel.startsWith("UC") ? { id: channel } : { forHandle: channel.replace(/^@/, "") };
  const d = await yt("channels", { part: "snippet,statistics,contentDetails,brandingSettings", ...params });
  const c = d.items?.[0];
  if (!c) throw new Error(`Channel not found: ${channel}`);
  return {
    id: c.id, title: c.snippet.title, handle: c.snippet.customUrl, country: c.snippet.country,
    createdAt: c.snippet.publishedAt, subscribers: c.statistics.subscriberCount,
    views: c.statistics.viewCount, videoCount: c.statistics.videoCount,
    uploadsPlaylistId: c.contentDetails.relatedPlaylists.uploads,
    keywords: c.brandingSettings?.channel?.keywords,
    description: (c.snippet.description ?? "").slice(0, 1500),
  };
}

server.registerTool("get_channel", {
  title: "Get channel details",
  annotations: { title: "Get channel details", ...READ_ONLY },
  description: "Channel info and stats by channel ID (UC...) or @handle. 1 quota unit.",
  inputSchema: { channel: z.string() },
}, safe(({ channel }) => getChannel(channel)));

server.registerTool("list_channel_videos", {
  title: "List channel videos",
  annotations: { title: "List channel videos", ...READ_ONLY },
  description: "Latest uploads for a channel (ID or @handle), newest first, with stats. ~2-3 quota units.",
  inputSchema: {
    channel: z.string(),
    max_results: z.number().int().min(1).max(200).default(25),
    with_stats: z.boolean().default(true),
  },
}, safe(async ({ channel, max_results, with_stats }) => {
  const ch = await getChannel(channel);
  const ids = []; let pageToken;
  while (ids.length < max_results) {
    const d = await yt("playlistItems", {
      part: "contentDetails", playlistId: ch.uploadsPlaylistId,
      maxResults: Math.min(50, max_results - ids.length), pageToken,
    });
    ids.push(...(d.items ?? []).map((i) => i.contentDetails.videoId));
    pageToken = d.nextPageToken; if (!pageToken) break;
  }
  if (!with_stats) return ids.map((id) => ({ id }));
  const out = [];
  for (let i = 0; i < ids.length; i += 50) out.push(...await getVideos(ids.slice(i, i + 50)));
  return out;
}));

server.registerTool("get_comments", {
  title: "Get video comments",
  annotations: { title: "Get video comments", ...READ_ONLY },
  description: "Top-level comments on a video (ID or URL). 1 quota unit.",
  inputSchema: {
    video: z.string(),
    max_results: z.number().int().min(1).max(100).default(50),
    order: z.enum(["relevance", "time"]).default("relevance"),
  },
}, safe(async ({ video, max_results, order }) => {
  const d = await yt("commentThreads", { part: "snippet", videoId: videoId(video), maxResults: max_results, order, textFormat: "plainText" });
  return (d.items ?? []).map((it) => {
    const c = it.snippet.topLevelComment.snippet;
    return { author: c.authorDisplayName, text: c.textDisplay, likes: c.likeCount, replies: it.snippet.totalReplyCount, publishedAt: c.publishedAt };
  });
}));

server.registerTool("get_playlist", {
  title: "Get playlist videos",
  annotations: { title: "Get playlist videos", ...READ_ONLY },
  description: "Videos in a playlist, in order. 1 quota unit per 50.",
  inputSchema: { playlist_id: z.string(), max_results: z.number().int().min(1).max(500).default(50) },
}, safe(async ({ playlist_id, max_results }) => {
  const out = []; let pageToken;
  while (out.length < max_results) {
    const d = await yt("playlistItems", { part: "snippet", playlistId: playlist_id, maxResults: Math.min(50, max_results - out.length), pageToken });
    for (const it of d.items ?? []) {
      const s = it.snippet;
      out.push({ position: s.position, videoId: s.resourceId.videoId, title: s.title, channel: s.videoOwnerChannelTitle, publishedAt: s.publishedAt });
    }
    pageToken = d.nextPageToken; if (!pageToken) break;
  }
  return out;
}));

server.registerTool("trending", {
  title: "Get trending videos",
  annotations: { title: "Get trending videos", ...READ_ONLY },
  description: "Most popular videos right now in a region. Optional category_id (28 Science & Tech, 20 Gaming, 22 People & Blogs, 24 Entertainment). 1 quota unit.",
  inputSchema: {
    region_code: z.string().default("AU"),
    category_id: z.string().optional(),
    max_results: z.number().int().min(1).max(50).default(20),
  },
}, safe(async (a) => {
  const d = await yt("videos", { part: "snippet,statistics,contentDetails", chart: "mostPopular", regionCode: a.region_code, videoCategoryId: a.category_id, maxResults: a.max_results });
  return (d.items ?? []).map(fmtVideo);
}));

server.registerTool("list_transcripts", {
  title: "List transcript tracks",
  annotations: { title: "List transcript tracks", ...READ_ONLY },
  description: "List caption tracks available for a video (ID or URL). No API key or quota needed.",
  inputSchema: { video: z.string() },
}, safe(async ({ video }) => {
  const { tracks } = await captionTracks(videoId(video));
  return tracks.map(({ url, ...t }) => t);
}));

server.registerTool("get_transcript", {
  title: "Get video transcript",
  annotations: { title: "Get video transcript", ...READ_ONLY },
  description: "Get a video's transcript (ID or URL). No API key or quota needed. Long transcripts are split into pages of about page_words words; when the result includes next_cursor, more of the transcript remains and can be fetched by calling again with the same arguments plus cursor. timestamps=false gives clean text for summarising; true gives [m:ss] chunks for citing moments or making chapters. start/end (seconds) limit to a section of the video.",
  inputSchema: {
    video: z.string(),
    languages: z.array(z.string()).default(["en"]).describe("Preference order, e.g. ['en','en-AU']"),
    translate_to: z.string().optional().describe("Machine-translate into this language code, e.g. 'en'"),
    timestamps: z.boolean().default(false),
    chunk_seconds: z.number().int().min(5).max(300).default(30),
    start: z.number().min(0).optional().describe("Only include from this many seconds in"),
    end: z.number().min(0).optional().describe("Only include up to this many seconds"),
    page_words: z.number().int().min(500).max(15000).default(8000).describe("Approximate words per page (8000 is roughly 11k tokens)"),
    cursor: z.string().optional().describe("next_cursor from a previous call, to fetch the next page"),
  },
}, safe(async (a) => {
  const vid = videoId(a.video);
  const { tracks } = await captionTracks(vid);
  const track = pickTrack(tracks, a.languages);
  const translated = !!(a.translate_to && track.code !== a.translate_to);
  if (translated && !track.translatable) throw new Error(`The ${track.language} track can't be translated.`);
  let snips = await fetchSnippets(translated ? `${track.url}&tlang=${encodeURIComponent(a.translate_to)}` : track.url);
  const fullDuration = snips.at(-1).start + snips.at(-1).duration;
  if (a.start != null) snips = snips.filter((s) => s.start + s.duration >= a.start);
  if (a.end != null) snips = snips.filter((s) => s.start <= a.end);
  if (!snips.length) throw new Error(`No transcript text between the requested start and end (video is ${ts(fullDuration)} long).`);

  // Build units: one per timestamp chunk, or one per caption line. Pages never split a unit.
  const units = [];
  if (a.timestamps) {
    let buf = [], start = null, end = 0;
    for (const s of snips) {
      if (start === null) start = s.start;
      buf.push(s.text); end = s.start + s.duration;
      if (end - start >= a.chunk_seconds) { units.push({ text: `[${ts(start)}] ${buf.join(" ")}`, start, end }); buf = []; start = null; }
    }
    if (buf.length) units.push({ text: `[${ts(start)}] ${buf.join(" ")}`, start, end });
  } else {
    for (const s of snips) units.push({ text: s.text, start: s.start, end: s.start + s.duration });
  }
  const wc = (t) => t.split(/\s+/).filter(Boolean).length;
  for (const u of units) u.words = wc(u.text);

  // Deterministic page boundaries, so a cursor from one call is valid in the next.
  const pageStarts = [0];
  for (let i = 0, w = 0; i < units.length; i++) {
    if (w > 0 && w + units[i].words > a.page_words) { pageStarts.push(i); w = 0; }
    w += units[i].words;
  }
  const totalWords = units.reduce((n, u) => n + u.words, 0);

  let page = 0;
  if (a.cursor != null) {
    const m = /^p(\d+)$/.exec(a.cursor);
    page = m ? +m[1] : -1;
    if (page < 0 || page >= pageStarts.length) {
      throw new Error(`Invalid cursor "${a.cursor}". Use the next_cursor value from the previous call, with the same video, language, timestamps, start, end and page_words.`);
    }
  }
  const slice = units.slice(pageStarts[page], pageStarts[page + 1] ?? units.length);
  const text = slice.map((u) => u.text).join(a.timestamps ? "\n" : " ");
  const hasMore = page + 1 < pageStarts.length;

  return {
    videoId: vid, language: track.language, code: translated ? a.translate_to : track.code,
    auto_generated: track.auto_generated, translated, duration: ts(fullDuration),
    page: page + 1, total_pages: pageStarts.length,
    covers: `${ts(slice[0].start)} to ${ts(slice.at(-1).end)}`,
    words: slice.reduce((n, u) => n + u.words, 0), total_words: totalWords,
    next_cursor: hasMore ? `p${page + 1}` : null,
    transcript: text,
  };
}));

await server.connect(new StdioServerTransport());
log("ready", KEY ? "(API key set)" : "(no API key: transcript tools only)");

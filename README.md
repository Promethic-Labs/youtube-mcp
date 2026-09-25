<p align="center">
  <img src="icon.png" width="96" alt="YouTube MCP">
</p>

<h1 align="center">YouTube MCP</h1>

<p align="center">
  Give Claude access to YouTube: transcripts, search, video and channel stats, comments, playlists and trending.<br>
  One-click install for Claude Desktop. Transcripts work with no API key.
</p>

<p align="center">
  <a href="https://github.com/Promethic-Labs/youtube-mcp/releases/latest"><b>Download YouTube.mcpb</b></a>
  ·
  <a href="#tools">Tools</a>
  ·
  <a href="#other-mcp-clients">Other clients</a>
  ·
  <a href="#development">Development</a>
</p>

---

## Install (Claude Desktop)

1. Download **`YouTube.mcpb`** from the [latest release](https://github.com/Promethic-Labs/youtube-mcp/releases/latest).
2. Double-click it (or drag it into Claude Desktop) and click **Install**.
3. Optionally paste a YouTube API key in the settings form. Skip it if you only need transcripts.

That's it. No Node, Python or terminal needed: Claude Desktop runs the extension on its built-in runtime.

Try asking Claude:

- *"Summarise this video: https://youtu.be/..."*
- *"Pull the transcript with timestamps and write chapter markers for the description."*
- *"What are people saying in the comments on this video?"*
- *"Show me @somechannel's last 20 uploads and which ones overperformed."*
- *"What's trending in Australia in Science & Tech right now?"*

## Tools

| Tool | What it does | Needs API key | Quota cost |
|---|---|---|---|
| `get_transcript` | Transcript of any public video, paginated for long videos. Options: timestamps, time range (`start`/`end`), translation, page size | No | None |
| `list_transcripts` | Caption tracks available for a video | No | None |
| `search` | Search videos, channels or playlists | Yes | 100 |
| `get_videos` | Details and stats for up to 50 videos | Yes | 1 |
| `get_channel` | Channel info and stats by ID or `@handle` | Yes | 1 |
| `list_channel_videos` | A channel's latest uploads with stats | Yes | ~2 to 3 |
| `get_comments` | Top-level comments on a video | Yes | 1 |
| `get_playlist` | Videos in a playlist, in order | Yes | 1 per 50 |
| `trending` | Most popular videos by region and category | Yes | 1 |

All tools accept video IDs or any YouTube URL (`watch`, `youtu.be`, `shorts`, `live`, `embed`).

**Transcript track selection:** manual captions are preferred over auto-generated ones, and regional variants count (asking for `en` will pick a manual `en-CA` track over an auto-generated `en` one).

## Getting a YouTube API key (optional)

1. Go to [Google Cloud Console](https://console.cloud.google.com/) and create or pick a project.
2. **APIs & Services > Library**, search for **YouTube Data API v3**, click **Enable**.
3. **APIs & Services > Credentials > Create credentials > API key**.
4. Recommended: restrict the key to YouTube Data API v3.

The free quota is 10,000 units per day. `search` costs 100 units, so Claude is told to prefer `list_channel_videos` when it already knows the channel.

In Claude Desktop you can add or change the key any time under **Settings > Extensions > YouTube**.

## Other MCP clients

The server is a standard stdio MCP server, so it works with Claude Code, Cursor, VS Code, Windsurf and others. Clone the repo and build it:

```bash
git clone https://github.com/Promethic-Labs/youtube-mcp.git
cd youtube-mcp
npm install
npm run build
```

**Claude Code**

```bash
claude mcp add youtube -e YOUTUBE_API_KEY=your_key -- node /absolute/path/to/youtube-mcp/dist/server/index.mjs
```

**JSON config** (Cursor, Windsurf and most other clients)

```json
{
  "mcpServers": {
    "youtube": {
      "command": "node",
      "args": ["/absolute/path/to/youtube-mcp/dist/server/index.mjs"],
      "env": { "YOUTUBE_API_KEY": "your_key" }
    }
  }
}
```

Requires Node 18 or newer. Leave out `YOUTUBE_API_KEY` if you only want transcripts.

## How transcripts work, and their limits

The official YouTube Data API only lets you download captions for videos you own, via OAuth. To support any public video, this server reads the same caption tracks the YouTube web player uses. That means:

- **Run it locally.** YouTube blocks these requests from most cloud and datacenter IPs, so hosting this on a server will usually fail. On a home or office connection it works normally.
- **It can break.** YouTube can change its internal endpoints without notice. If transcripts stop working, check for a new release or open an issue.
- **Heavy use can get rate limited.** If you see a captcha error, wait a while before trying again.
- **Long videos are paginated.** Transcripts come back in pages of about 8,000 words (roughly 11k tokens), well under the tool response limits of Claude Desktop and Claude Code. If there's more, the result includes a `next_cursor` and Claude fetches the next page. Use `page_words` to change the page size, or `start` and `end` to grab a specific section.

Everything except transcripts goes through the official YouTube Data API v3.

## Privacy Policy

The extension runs entirely on your computer. It sends requests only to YouTube (`www.youtube.com`) and the Google YouTube Data API (`www.googleapis.com`), directly from your machine. It has no analytics or telemetry, stores nothing, and sends nothing to Promethic Labs or any other third party. Your API key is stored by Claude Desktop as a sensitive setting and is never logged.

Full policy, covering data collection, use, storage, sharing, retention and contact: [PRIVACY.md](PRIVACY.md)

## Development

```bash
npm install
npm start            # run the server from source over stdio
npm run build        # bundle into dist/
npm run pack         # build and create youtube-mcp.mcpb
npm run validate     # validate manifest.json against the MCPB spec
```

Project layout:

```
src/index.js         server source (all tools)
manifest.json        MCPB manifest (version is synced from package.json on build)
scripts/build.mjs    bundles the server with esbuild and assembles dist/
.github/workflows/   CI on every push, release build on version tags
```

The server is bundled into a single file, so the `.mcpb` has no `node_modules` and stays around 235 KB.

### Releasing

1. Bump `version` in `package.json` and add a note to `CHANGELOG.md`.
2. Commit, then tag and push:

```bash
git tag v1.0.2
git push origin main --tags
```

GitHub Actions builds `YouTube.mcpb` and attaches it to a new release.

## Contributing

Issues and pull requests are welcome. For anything larger than a bug fix, please open an issue first so we can agree on the approach. Please run `npm run validate` and `npm run pack` before submitting.

## Disclaimer

Not affiliated with, endorsed by, or sponsored by YouTube or Google. YouTube is a trademark of Google LLC. You are responsible for using this tool in line with the [YouTube Terms of Service](https://www.youtube.com/t/terms) and the [YouTube API Services Terms](https://developers.google.com/youtube/terms/api-services-terms-of-service).

## License

[MIT](LICENSE) © Promethic Labs Pty Ltd

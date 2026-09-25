# Privacy Policy

**YouTube MCP** (the "Extension"), published by Promethic Labs Pty Ltd ("Promethic Labs", "we")

Last updated: 25 September 2026

The Extension is open-source software that runs entirely on your own computer as a local MCP server inside Claude Desktop or another MCP client. Promethic Labs does not operate any server for the Extension and never receives your data.

## 1. Data collection

The Extension does not collect personal information. To do what you ask, it handles the following on your device:

- **Request inputs:** video IDs or URLs, channel IDs or handles, playlist IDs, search queries, region and language codes, supplied by the AI assistant when it calls a tool.
- **Your YouTube Data API key (optional):** entered in the Extension's settings and passed to the Extension as an environment variable.
- **Public YouTube content returned by YouTube:** video, channel and playlist metadata, public comments and caption/transcript text.

It does not access your files, your Google or YouTube account, your conversations with the AI assistant, or any other data on your computer.

## 2. How data is used

Request inputs are used only to make the matching request to YouTube and return the result to your AI assistant. Your API key is used only to authenticate requests to the YouTube Data API v3. The Extension has no analytics, telemetry, tracking or advertising.

## 3. Storage

The Extension does not store data. Results are held in memory only for the duration of a tool call. Your API key is stored by your MCP client (for Claude Desktop, as a sensitive extension setting), not by the Extension. Your MCP client may keep local log files of the Extension's error messages on your computer; these never include your API key.

## 4. Sharing and third parties

The Extension sends requests directly from your computer to:

- **Google / YouTube Data API v3** (`www.googleapis.com`), for search, video, channel, comment, playlist and trending data, authenticated with your API key.
- **YouTube** (`www.youtube.com`), to read the public caption tracks of a video.

These requests are subject to [Google's Privacy Policy](https://policies.google.com/privacy) and the [YouTube Terms of Service](https://www.youtube.com/t/terms). Use of the YouTube API Services is also subject to the [YouTube API Services Terms of Service](https://developers.google.com/youtube/terms/api-services-terms-of-service). Data is not shared with Promethic Labs or anyone else, and is never sold.

Results are returned to the AI assistant you are using, which handles them under that provider's own privacy policy (for Claude, [Anthropic's Privacy Policy](https://www.anthropic.com/legal/privacy)).

## 5. Retention

The Extension retains nothing. Once a tool call finishes, its data exists only in your conversation with your AI assistant. To remove your API key, clear it in the Extension's settings or uninstall the Extension.

## 6. Children

The Extension is not directed at children and does not knowingly process children's personal information.

## 7. Changes

Changes to this policy are published in this file, with the date above updated. The full history is available in the repository's commit log.

## 8. Contact

Promethic Labs Pty Ltd, Sydney, Australia
Privacy questions or requests: open an issue at https://github.com/Promethic-Labs/youtube-mcp/issues

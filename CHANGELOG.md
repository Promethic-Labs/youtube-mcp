# Changelog

## 1.2.0

- Every tool now has a title and read-only annotations, so Claude can run them without asking for confirmation on each call.
- Added a full privacy policy (`PRIVACY.md`), linked from the README and `manifest.json`.
- Reworded the `search` tool description.

## 1.1.0

- `get_transcript` now paginates long transcripts so they never exceed client tool response limits. Pages default to about 8,000 words (`page_words`, 500 to 15,000). Each result includes `page`, `total_pages`, `covers` (time span), `total_words` and `next_cursor`.
- Pages never split a caption line or timestamp chunk, and page boundaries are deterministic, so cursors stay valid between calls.
- Clearer errors for invalid cursors and for `start`/`end` ranges with no transcript text.

## 1.0.1

- Transcript track selection now prefers manual captions in a regional variant (for example `en-CA`) over auto-generated captions in the exact language.

## 1.0.0

- Initial release: `get_transcript`, `list_transcripts`, `search`, `get_videos`, `get_channel`, `list_channel_videos`, `get_comments`, `get_playlist`, `trending`.
- One-click Claude Desktop extension (`.mcpb`). Transcripts work without an API key.

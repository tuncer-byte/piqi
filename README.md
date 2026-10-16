<div align="center">
  <img src="resources/icon.png" alt="Piqi app icon" width="112" height="112" />
  <h1>Piqi</h1>
  <p><strong>Meeting answers, grounded in your product knowledge.</strong></p>
  <p>A macOS meeting assistant with live transcripts, a searchable knowledge base, and source-linked answers.</p>
</div>

Piqi helps solution architects, pre-sales engineers, and technical consultants answer product questions without searching through documents in the middle of a meeting. It listens to configured meeting audio, keeps a live transcript, finds relevant information in your sources, and presents concise answers with references in a compact on-screen Island.

Piqi is a desktop assistant, not a meeting bot: it does not join calls or speak to other participants on your behalf. You review its suggestions and answer in your own words.

## How It Works

1. Add product documentation, code, or other knowledge sources to Piqi.
2. Start listening before or during a meeting. Piqi captures the microphone and, when enabled, supported meeting-app audio as separate channels.
3. Ask Piqi a question by voice or with the configured keyboard shortcut, or let it detect a question in the other-party channel.
4. Piqi searches the indexed sources and shows a short answer with references. Expand the answer when you need more detail.

## Features

- Live meeting transcription with separate microphone and system-audio channels.
- Voice activation with “Selam Piqi” or the configured character name.
- A searchable knowledge base for documents, code repositories, websites, Confluence, Notion, and approved Q&A entries.
- Source-linked answers, with file, page, or code references where available.
- Local folder and Git repository scanning, with folder inclusion controls and `.gitignore` support.
- Incremental indexing and optional change watching for local sources.
- Anthropic, Google Gemini, and OpenAI-compatible model providers, including local-compatible endpoints.
- Privacy controls for cloud access and personal-data masking; provider credentials are stored in the macOS Keychain.
- Meeting history, transcripts, summaries, and unanswered-question follow-up.
- macOS voice output, with optional local EMA text-to-speech support.

## Add Knowledge Sources

Open **Sources** and choose **Add source**. Piqi supports:

| Source | Examples and options |
|---|---|
| Documents | PDF, DOCX, PPTX, XLSX, Markdown, TXT, and HTML files or folders |
| Code | A local repository or Git URL; review detected folders and choose what to include |
| Web | A public URL, optionally following its sitemap within the configured page limit |
| Confluence | Cloud or Data Center / Server spaces |
| Notion | Pages accessible to a Notion integration |
| Approved Q&A | Curated question-and-answer pairs for stable product facts |

After indexing, the Sources screen shows each source’s status and available counts. Use **Reindex** to refresh a source manually. Local code and document sources can also be configured for change watching.

## During a Meeting

1. Add the sources you want Piqi to use and confirm that indexing has completed.
2. Configure a model provider in **Settings → Models and providers**. Add its API key in the app settings, or configure a compatible local endpoint.
3. Review **Settings → Privacy and compliance** to set cloud access and masking behavior for your environment.
4. Grant the macOS permissions requested by the app, select the audio capture options, and start listening.
5. Use the wake phrase or the in-app keyboard shortcut to ask a question. Review the answer and its source references in the Island.

The exact providers and capture options available depend on your configuration and macOS permissions. Piqi does not automatically send every source or transcript to a model: model requests are made when an answer or other configured AI task is run, subject to the selected provider and privacy policy.

## Privacy

- Audio capture and speech-recognition behavior depend on the selected engine and macOS configuration. Piqi does not persist raw captured audio as meeting recordings.
- When a cloud model is used, the text required for that request is sent to the selected provider. Configure provider access and personal-data masking in the app before using it with sensitive information.
- Provider API keys and remote-source credentials are stored in the macOS Keychain rather than in source records.
- Audit records are designed to contain request metadata rather than question and answer text.
- Review your organization’s privacy, retention, and data-handling requirements before connecting sensitive sources or using a cloud provider.

## Requirements

- macOS 14.4 or later
- Node.js 23 or later
- Xcode with Swift 6.1 or later, for the native audio helper
- Rust toolchain, for the optional local TTS process; the version is pinned in `native/piqi-tts/rust-toolchain.toml`

Some native dependencies may require additional downloads during the first build or first use.

## Run From Source

```sh
npm install
npm run dev
```

Useful development commands:

```sh
npm test          # Run the test suite
npm run typecheck # Check TypeScript projects
npm run build     # Build native helpers and the Electron app
npm run dist      # Package a macOS app
```

On first launch, macOS may ask for microphone, speech-recognition, and system-audio permissions. Grant only the permissions needed for the capture features you choose to use.

## Project Layout

| Path | Purpose |
|---|---|
| `src/main` | Electron main process, audio services, assistant, settings, and knowledge indexing |
| `src/renderer` | Main application, settings, Sources screen, and Island interface |
| `src/preload` | Typed bridge between the renderer and Electron main process |
| `src/shared` | Shared types, IPC contracts, provider definitions, and brand assets |
| `native/piqi-audio` | Swift audio capture and speech-related helper |
| `native/piqi-tts` | Rust-based local text-to-speech process |
| `docs/PRD.md` | Product requirements and design context |

## Project Status

Piqi is under active development. Features, provider compatibility, and packaging may change. Signed distribution and a stable release process are not yet complete.
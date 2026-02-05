# Say

A progressive web app that converts Substack articles into audio using AI text-to-speech. Paste a Substack URL, and Say scrapes the article and streams it back as spoken audio with gapless playback.

## Features

- **Substack article scraping** — paste any Substack URL to extract the article text
- **Streaming TTS** — audio generation streams in real time via the Inworld AI API
- **Gapless playback** — Web Audio API schedules segments back-to-back with crossfades
- **Multiple voices** — choose from several Inworld AI voice options
- **MP3 and WAV** — supports both audio encoding formats
- **Download** — save generated audio as a file
- **Seek and replay** — seamlessly switches to native HTML5 audio for seeking
- **PWA** — installable, works offline (cached assets), supports Web Share Target
- **Three themes** — light, dusk, and midnight with warm color palettes
- **Privacy-first** — your API key stays in your browser's localStorage, never stored server-side

## Getting Started

### Prerequisites

- Node.js
- An [Inworld AI](https://inworld.ai) API key for text-to-speech

### Install

```bash
npm install
```

### Development

```bash
# Frontend only (no API routes)
npm run dev

# Full local dev with Vercel serverless functions
npm run dev:vercel
```

Use `dev:vercel` when working with the `/api/scrape` and `/api/tts` endpoints.

### Build

```bash
npm run build
npm run preview
```

### Lint

```bash
npm run lint
```

## How It Works

1. User pastes a Substack URL
2. `/api/scrape` fetches and parses the article HTML with Cheerio
3. `/api/tts` chunks the text and calls Inworld's streaming TTS API
4. The frontend decodes audio segments in real time and schedules gapless playback via the Web Audio API
5. Once complete, the full audio is available for download or seeking

## Tech Stack

- **Frontend:** React 19, Vite, CSS custom properties
- **Backend:** Vercel serverless functions (Node.js)
- **TTS:** Inworld AI streaming API
- **Scraping:** Cheerio
- **PWA:** vite-plugin-pwa + Workbox

## Deployment

Deployed on Vercel. The `vercel.json` configures the Vite framework, build output, and CORS headers for API routes.

## License

Private

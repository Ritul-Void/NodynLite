# KnowledgeFox

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node.js-v18+-green)](https://nodejs.org/)

Intelligent in-browser semantic search for web pages using Transformers.js. A Chrome extension that ingests page content and retrieves relevant information with AI-powered understanding.

## Features

- 🧠 **Semantic Search** — AI-powered retrieval using Transformers.js
- ⚡ **In-Browser** — No external API calls, runs entirely on your machine
- 📄 **Smart Ingestion** — Extracts and processes page content intelligently
- 🔒 **Privacy First** — Your data never leaves your browser


## Quick Start

```bash
npm install
npm run build
```

### Install in Chrome or Firefox

- **Chrome:**
	1. Go to `chrome://extensions/`
	2. Enable "Developer mode"
	3. Click "Load unpacked" and select the `build/` folder

- **Firefox:**
	1. Go to `about:debugging#/runtime/this-firefox`
	2. Click "Load Temporary Add-on" and select any file in the `build/` folder
	3. Firefox version is included in the build with extra support

### Install from Release ZIP

- Download the latest release ZIP from [GitHub Releases](https://github.com/Ritul-Void/KnowlegeFox-InBrowserRag/releases)
- Unzip and load as above

> **Note:** Not available on the Chrome Web Store yet.

## Development

```bash
npm run dev   # Watch mode
npm run build # Production build
```

## Tech Stack

- Transformers.js — On-device ML
- Webpack — Module bundling
- @mozilla/readability — Content extraction

## License

MIT © [Xenova](https://github.com/xenova)

---

## Future Updates / Changelog

- Vector engine for faster, smarter search
- Transformers.js LLM support
- Ollama integration
- Special site module support for better extraction

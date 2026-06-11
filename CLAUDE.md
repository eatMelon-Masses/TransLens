# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TransLens is a Chrome extension for language learning. It automatically detects foreign language text on web pages, selects vocabulary using spaced repetition (SRS), and annotates words with AI-powered translations.

**Status**: Ready for Chrome Web Store submission (v2.0)

## Architecture

Pure front-end Chrome extension (Manifest V3) — no backend required.

```
translate/
├── manifest.json       # Extension config (icons, permissions, content scripts)
├── background.js       # Service Worker — handles AI API calls (OpenAI/Anthropic/Custom)
├── content.js          # Content Script — DOM extraction, SRS engine, annotation
├── popup.html/js       # Extension popup — status + quick toggle
├── settings.html/js/css# Settings page — full configuration UI
├── privacy.html        # Privacy policy page
└── icon48.png / icon128.png
```

### Data Flow

1. User configures API key + languages in Settings
2. Content script scans page for target language text
3. SRS engine decides which words need review
4. Background worker calls AI API for translation
5. Annotations added inline to DOM

### Key Features

- **Multi-language**: Chinese, Japanese, Korean, French, German, Spanish, Russian, Arabic (+ custom regex)
- **SRS (SM-2)**: Tracks `easiness`, `interval`, `nextReview` per word
- **AI Providers**: OpenAI GPT-4o, Anthropic Claude, Custom OpenAI-compatible endpoints
- **Site Toggle**: Popup button to disable/enable per website
- **Privacy**: All data in `chrome.storage.local`, no external collection

## File Structure

```
TransLens/
├── translate/              # Chrome extension (publish this folder)
│   ├── Core Files
│   │   ├── manifest.json
│   │   ├── background.js
│   │   ├── content.js
│   │   ├── popup.html/js
│   │   ├── settings.html/js/css
│   │   ├── icon48.png / icon128.png
│   │   └── privacy.html
│   ├── Documentation
│   │   ├── README.md           # Extension README
│   │   ├── PRIVACY.md          # Privacy policy (text)
│   │   ├── STORE_LISTING.md    # Chrome Web Store description
│   │   ├── USAGE.md            # User guide
│   │   └── CHECKLIST.md        # Publishing checklist
│   ├── Build
│   │   ├── package.sh          # Creates release zip
│   │   └── TransLens-2.0.zip   # Ready-to-upload package
│   └── Screenshots
│       ├── 1.png, 2.png, 3.png # Demo screenshots
│       └── test.html           # Local test page
├── figures/                # Original screenshots (for README)
├── README.MD               # Legacy project README (old backend architecture)
└── CLAUDE.md               # This file
```

## Development Commands

### Load Extension (Development)
```
1. chrome://extensions/
2. Enable "Developer mode"
3. "Load unpacked" → select translate/ folder
```

### Build Release Package
```bash
cd translate/
bash package.sh
# Creates TransLens-2.0.zip
```

### Test Locally
```
1. Open translate/test.html in browser
2. Or visit any Chinese website
3. Check DevTools console for [TransLens] logs
```

## Storage Schema

### chrome.storage.local — settings
```javascript
{
  provider: "openai" | "anthropic" | "custom",
  apiKey: string,
  model: string,
  customUrl: string,
  sourceLang: "zh-CN" | "ja" | "ko" | ...,
  targetLang: "en" | "zh-CN" | ...,
  mode: "vocabulary" | "sentence",
  selectRatio: number (10-100),
  minWordLen: number,
  intervalMultiplier: number,
  maxNewWords: number,
  masteryThreshold: number,
  disabledSites: string[]  // e.g., ["www.example.com"]
}
```

### chrome.storage.local — srsData
```javascript
{
  "词汇": {
    word: "词汇",
    language: "zh-CN",
    easiness: 2.5,
    interval: 0,
    repetitions: 0,
    nextReview: timestamp,
    lastSeen: timestamp,
    translation: "vocabulary",
    contextCount: 5,
    createdAt: timestamp,
    reviewCount: 0
  },
  ...
}
```

## API Contract

**chrome.runtime.sendMessage** (content.js → background.js)
```javascript
{
  type: "TRANSLATE",
  payload: {
    sentence: "中文句子",
    targetWord: "词汇",
    sourceLang: "Chinese Simplified",
    targetLang: "English",
    settings: {
      provider: "openai",
      apiKey: "sk-...",
      model: "gpt-4o-mini",
      customUrl: ""
    }
  }
}
```

Response:
```javascript
{
  targetWord: "词汇",
  translation: "vocabulary",
  error?: string
}
```

## Publishing

1. Run `bash package.sh` to create `TransLens-2.0.zip`
2. Upload to Chrome Web Store Developer Console
3. Fill store listing using `STORE_LISTING.md`
4. Host `privacy.html` and add URL
5. Submit for review

See `CHECKLIST.md` for full publishing checklist.

## Notes

- Old backend files (`gguf_model.py`, `translation_cache.json`, `word_frequency.json`) have been removed — v2.0 is pure front-end
- SSL certs (`server.crt`, `server.key`) in root are unused relics
- macOS metadata files (`._*`) are auto-generated; run `find . -name '._*' -delete` before packaging
- Extension requires user's own API key (no built-in key)

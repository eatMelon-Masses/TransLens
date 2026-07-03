# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TransLens is a Chrome extension for language learning. It automatically detects foreign language text on web pages, selects vocabulary using spaced repetition (SRS), and annotates words with AI-powered translations.

**Status**: Ready for Chrome Web Store submission (v2.2)

## Architecture

Pure front-end Chrome extension (Manifest V3) — no backend required.

```
translate/
├── manifest.json       # Extension config (icons, permissions, content scripts, i18n)
├── background.js       # Service Worker — handles AI API calls (OpenAI/Anthropic/Custom)
├── content.js          # Content Script — DOM extraction, SRS engine, annotation (skips form inputs)
├── popup.html/js       # Extension popup — status + quick toggle
├── settings.html/js/css# Settings page — full configuration UI (disabled sites management)
├── _locales/en/zh_CN   # i18n — English and Chinese display names
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

- **Multi-language**: Chinese (Simp/Trad), Japanese, Korean, French, German, Spanish, Russian, Arabic (+ custom regex)
- **SRS (SM-2)**: Tracks `easiness`, `interval`, `nextReview` per word
- **AI Providers**: OpenAI GPT-4o, Anthropic Claude, Custom OpenAI-compatible endpoints (Ollama, llama.cpp, etc.)
- **Site Toggle**: Popup button to disable/enable per website; manual add with wildcard support (`*.example.com`) in Settings
- **Form Input Skipping**: Skips `input/textarea/select/button` elements to avoid annotating search box text
- **i18n**: Display name localized — English: "TransLens - Language Learning Tool", Chinese: "翻译透镜-语言学习工具"
- **Privacy**: All data in `chrome.storage.local`, no external collection

## File Structure

```
TransLens/
├── translate/              # Chrome extension (publish this folder)
│   ├── Core Files
│   │   ├── manifest.json
│   │   ├── background.js
│   │   ├── content.js
│   │   ├── popup.html / popup.js
│   │   ├── settings.html / settings.js / settings.css
│   │   ├── _locales/en/messages.json / _locales/zh_CN/messages.json
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
│   │   └── TransLens-2.2.zip   # Ready-to-upload package
│   ├── Test/Preview
│   │   ├── test.html           # Local test page with Chinese text
│   │   └── style-preview.html  # Annotation style preview
│   └── Screenshots/            # 1.png, 2.png, 3.png — Demo screenshots
├── figures/                # Original screenshots (for README)
├── 审核材料/               # Review materials for CWS
├── README.MD               # Legacy project README (v1 backend architecture)
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
1. Open translate/test.html in browser (or load as unpacked extension)
2. Or visit any foreign-language website
3. Check DevTools console for [TransLens] logs
```

## Storage Schema

### chrome.storage.local — settings
Settings use a **per-provider** structure. Legacy flat configs are auto-migrated by `migrateSettings()` in `settings.js`.

```javascript
{
  provider: "openai" | "anthropic" | "custom",
  providers: {
    openai:  { apiKey: string, model: string },
    anthropic: { apiKey: string, model: string },
    custom:  { apiKey: string, customUrl: string, model: string }
  },
  sourceLang: "zh-CN" | "zh-TW" | "ja" | "ko" | "fr" | "de" | "es" | "ru" | "ar" | "custom",
  targetLang: "en" | "zh-CN" | ...,
  customRegex: string,                    // when sourceLang = "custom"
  mode: "vocabulary" | "sentence",
  selectRatio: number (10-100),           // % of candidates to annotate
  minWordLen: number,
  maxPhraseLen: number,
  maxTranslationsPerPage: number,         // cap per page scan
  annotationScale: number (90-130),       // percentage
  intervalMultiplier: number,             // SRS interval multiplier
  maxNewWords: number,                    // daily new word cap
  masteryThreshold: number,               // reviewCount to mark mastered
  translationConcurrency: number (1-5),   // parallel API calls (default 3)
  disabledSites: string[]                 // e.g., ["www.example.com", "*.google.com"] — supports wildcard patterns
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
    phonetic: "/.../",           // IPA for the translation (target language)
    contextCount: 5,
    createdAt: timestamp,
    reviewCount: 0
  }
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
  targetWord: null,
  translation: "vocabulary",
  phonetic: "/.../",
  error?: string
}
```

## Architecture Details

### Content Script (content.js)
- **IIFE** with `"use strict"`, no global leakage
- **DOM Walker**: `TreeWalker` iterates text nodes, skipping `<script>`, `<style>`, `<input>`, `<textarea>`, `<select>`, `<button>`, already-annotated nodes, and its own `.translens-annotation` elements
- **Disabled Sites Matching**: `isHostDisabled()` supports exact match and wildcard patterns (`*.example.com` matches the domain and all subdomains)
- **Language detection**: Regex-based per language in `LANG_PATTERNS`. CJK languages use character class ranges; alphabetic languages use `[a-zA-Z...]` with language-specific accented char support
- **Word selection**: Filters mastered/not-due words, respects `maxNewWords` daily cap, prioritizes due-for-review words, then randomizes new words
- **Annotation**: Replaces target word with `<span class="translens-annotation">` — dotted underline, inline translation badge, hover phonetic popup
- **Concurrency**: `runWithConcurrency()` limits parallel API calls (default 3, max 5)
- **Caching**: Cached translations are annotated immediately; only uncached words hit the API

### Background Worker (background.js)
- Service worker with single `onMessage` listener for `TRANSLATE` type
- Three API functions: `callOpenAI()`, `callAnthropic()`, `callCustom()`
- All use `max_tokens: 80`, `temperature: 0.3`
- Prompt asks AI to return JSON `{translation, phonetic}` — **phonetic is always for the translation (target language)**, never for the source word
- JSON parsing is best-effort; falls back to returning raw content as translation with empty phonetic
- Custom provider defaults to `http://localhost:11434/v1/chat/completions` (Ollama)

### Settings Page (settings.js)
- **Migration**: `migrateSettings()` converts old flat config (`apiKey`, `model`, etc.) to new per-provider `providers` structure
- **Per-provider forms**: Switching provider radio buttons saves current provider's form values and loads the new provider's saved values
- **Custom endpoint permissions**: `ensureCustomEndpointPermission()` requests Chrome host permissions for remote custom URLs via `chrome.permissions.request()`
- **Test Connection**: Sends a test `TRANSLATE` message to verify API key works
- **Export**: CSV export of word list (word, translation, interval, lastSeen)
- **Clear cache**: Removes `srsData`, `translationCache`, and `settings`

### Popup (popup.js)
- Reads `settings` and `srsData` from storage, displays provider status, language pair, word count
- Toggle button adds/removes `window.location.hostname` from `disabledSites` array

## Important Implementation Notes

- **No automated tests**: `translate/test.html` is a manual DOM traversal test page, not a unit test
- **No Cursor/Copilot rules**: No `.cursorrules`, `.cursor/rules/`, or `.github/copilot-instructions.md` exist
- **`translationCache`** key is referenced in settings.js clear function but SRS data itself serves as the translation cache in v2.0
- **`targetWord`** in API response is always `null` — the caller already knows the target word
- **Annotation marker**: `data-translens-processed="true"` on annotated parent elements to avoid reprocessing
- **macOS metadata**: `._*` files are auto-generated; `package.sh` excludes them
- **Legacy files** (`gguf_model.py`, `translation_cache.json`, `word_frequency.json`, `server.crt`, `server.key`) are relics from v1 — not used

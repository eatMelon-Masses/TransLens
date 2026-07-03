# TransLens

**翻译透镜-语言学习工具 | Language Learning Assistant for Chrome**

[![Version](https://img.shields.io/badge/version-2.2-blue)](https://chrome.google.com/webstore)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

> Learn languages naturally while browsing the web. TransLens uses AI translation and spaced repetition to help you build vocabulary in context.

## Features

- 🌐 **Multi-Language Support**: Chinese, Japanese, Korean, French, German, Spanish, Russian, Arabic
- 🧠 **SRS Algorithm**: Smart review scheduling (SM-2 based)
- 🤖 **AI Translation**: OpenAI / Anthropic / custom OpenAI-compatible endpoints
- 🔒 **Privacy First**: Learning data stored locally; translation snippets sent only to the provider you configure
- ⚡ **Smart Annotation**: Learn words in their natural context
- 🚫 **Smart Skipping**: Automatically skips search boxes and form input fields to avoid interference
- 🎯 **Flexible Site Control**: Disable per site via popup, or manually add domains with wildcard support (e.g. `*.example.com`) in Settings

## Installation

### From Chrome Web Store (Recommended)
1. Visit the TransLens Chrome Web Store listing after it is published
2. Click "Add to Chrome"

### Manual Installation
1. Download the latest release zip
2. Open Chrome → `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the extension folder

## Quick Start

1. **Configure API Key**
   - Click extension icon → Settings
   - Select your AI provider (OpenAI/Anthropic/custom)
   - Enter your API key

2. **Set Languages**
   - Choose source language (what you're learning)
   - Choose target language (your native language)

3. **Start Browsing**
   - Visit any website in your target language
   - New words will be annotated automatically

## Development

### Project Structure
```
translate/
├── manifest.json      # Extension configuration
├── background.js      # Service worker (API calls)
├── content.js         # Content script (DOM annotation)
├── popup.html/js      # Extension popup
├── settings.html/js   # Settings page
├── settings.css       # Settings styles
├── _locales/          # i18n (en, zh_CN)
├── icon48.png         # Extension icon (48px)
├── icon128.png        # Extension icon (128px)
└── privacy.html       # Privacy policy
```

### Build Package
```bash
cd translate/
chmod +x package.sh
./package.sh
```

This creates `TransLens-2.2.zip` ready for upload.

## Tech Stack

- **Manifest V3** - Latest Chrome extension format
- **Vanilla JavaScript** - No framework dependencies
- **SRS (SM-2)** - Spaced repetition algorithm
- **AI Providers** - OpenAI, Anthropic, custom OpenAI-compatible APIs

## Permissions

| Permission | Purpose |
|------------|---------|
| `storage` | Save settings and learning progress locally |
| `activeTab` | Identify current website for disable feature |
| `host_permissions` | Access AI provider APIs and local endpoints |

## Privacy

- No developer-operated data collection server
- No analytics or tracking
- API keys are stored locally and sent only to the configured AI provider endpoint when making translation requests
- See [PRIVACY.md](PRIVACY.md) for details

## Documentation

- [Usage Guide](USAGE.md) - How to use TransLens
- [Privacy Policy](PRIVACY.md) - Data handling practices
- [Store Listing](STORE_LISTING.md) - Chrome Web Store description
- [Publishing Checklist](CHECKLIST.md) - Release process

## Contributing

Issues and pull requests are welcome!

## License

MIT License - See LICENSE file for details

---

**Version**: 2.2

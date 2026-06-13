# TransLens Privacy Policy

**Effective Date:** June 13, 2026

## 1. Overview

TransLens is a Chrome extension that annotates language-learning words on web pages and stores spaced-repetition learning progress locally in Chrome.

## 2. Data Handled by the Extension

TransLens handles the following data to provide its core functionality:

- **Web page text snippets:** A sentence or short surrounding text and the selected word are used to request a translation.
- **Settings:** AI provider, model, language preferences, display preferences, disabled sites, and related configuration.
- **API credentials:** API keys entered by the user for OpenAI, Anthropic, or a custom OpenAI-compatible endpoint.
- **Learning data:** Word history, translations, phonetics, review intervals, mastery status, and timestamps.

## 3. Local Storage

Settings, API credentials, disabled sites, and learning data are stored locally using `chrome.storage.local`. TransLens does not operate a server and does not collect this data on a developer-controlled server.

## 4. Third-Party AI Services

When TransLens translates a word, it sends the relevant text snippet and target word directly from the extension to the AI provider selected by the user:

- OpenAI, if the user chooses OpenAI
- Anthropic, if the user chooses Anthropic
- A custom OpenAI-compatible endpoint configured by the user, if the user chooses Custom

API credentials are sent only to the selected provider endpoint as required for authentication. If the user configures a remote custom endpoint, TransLens requests permission to access that endpoint's origin. The selected provider processes requests under its own terms and privacy policy.

## 5. Data Sharing

TransLens does not sell user data, does not use user data for advertising, and does not share user data with data brokers or advertising networks. TransLens transfers text snippets and API credentials only as necessary to provide the user-requested translation feature through the selected AI provider.

## 6. Analytics and Tracking

TransLens does not include analytics SDKs, tracking cookies, advertising code, affiliate code, or behavioral tracking.

## 7. Chrome Permissions

TransLens requests these permissions:

- `storage`: Saves settings, API credentials, disabled sites, and learning progress locally.
- `activeTab`: Reads the current tab URL after the user opens the popup, so the user can disable or enable TransLens for the current site.
- Host access to `http://*/*` and `https://*/*` through the content script: Reads page text and injects inline vocabulary annotations.
- Host permissions for `https://api.openai.com/*`, `https://api.anthropic.com/*`, `http://localhost/*`, and `http://127.0.0.1/*`: Sends translation requests to built-in and local AI endpoints.
- Optional host permissions for custom `http://` and `https://` endpoints: Requested only when the user configures a custom remote endpoint.

## 8. Limited Use Statement

The use of information received from Chrome APIs adheres to the Chrome Web Store User Data Policy, including the Limited Use requirements. TransLens uses user data only to provide and improve its single purpose: contextual vocabulary translation and spaced-repetition learning in the browser.

## 9. Children's Privacy

TransLens is a general-purpose language-learning tool and is not directed to children under 13. TransLens does not knowingly collect personal information from children.

## 10. Changes to This Policy

This policy may be updated when TransLens changes its data handling practices. The current policy should be made available from the Chrome Web Store listing and the extension settings page.

## 11. Contact

For privacy questions, use the developer contact email listed on the Chrome Web Store listing.

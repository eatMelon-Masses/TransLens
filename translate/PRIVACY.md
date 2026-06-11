# TransLens Privacy Policy

**Effective Date:** January 2026

## 1. Introduction

TransLens ("we", "our", "us") is committed to protecting your privacy. This Privacy Policy explains how we handle your data when you use the TransLens Chrome extension.

## 2. Data Collection

**We do NOT collect any personal data.** All data is stored locally in your browser using Chrome's storage API:

- **Settings:** Your AI provider configuration (provider type, API key, custom URL, language preferences)
- **SRS Data:** Your learning progress (word history, review intervals, mastery status)
- **Disabled Sites:** List of websites where you've disabled the extension

## 3. API Keys

Your API key (for OpenAI, Anthropic, or custom providers) is stored locally in Chrome's storage. We never transmit your API key to any server other than the respective AI provider's API endpoint.

## 4. Third-Party Services

TransLens uses AI translation services (OpenAI, Anthropic, or your custom endpoint). When you translate text:

- The text snippet (sentence + target word) is sent directly to the AI provider's API
- The AI provider processes your request according to their own privacy policy
- We do not log, store, or transmit your translation requests to any third party

## 5. Permissions

TransLens requires the following Chrome permissions:

- `storage`: To save your settings and learning progress locally
- `activeTab`: To identify the current website for the disable feature
- `host_permissions`: To access AI provider APIs (api.openai.com, api.anthropic.com)

## 6. No Analytics or Tracking

TransLens does not use analytics services, tracking cookies, or any form of user behavior tracking.

## 7. Children's Privacy

TransLens is a general-purpose language learning tool and is not directed at children under 13. We do not knowingly collect personal information from children.

## 8. Changes to This Policy

We may update this Privacy Policy from time to time. The updated version will be available in the extension's settings page.

## 9. Contact

For privacy-related questions, please contact: [your-email@example.com]

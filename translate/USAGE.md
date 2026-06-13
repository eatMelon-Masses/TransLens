# TransLens - Usage Instructions

## Quick Start Guide

### Step 1: Install the Extension

1. Download TransLens from Chrome Web Store
2. Click "Add to Chrome"
3. The TransLens icon will appear in your extension toolbar

### Step 2: Configure Settings

Click the extension icon → "Open Settings"

**AI Provider Setup:**

Choose one of the following:

- **OpenAI**: Enter your API key (get one at platform.openai.com)
  - Default model: gpt-4o-mini
  
- **Anthropic**: Enter your API key (get one at console.anthropic.com)
  - Default model: claude-sonnet-4-20250514

- **Custom**: For local AI servers (Ollama, llama.cpp, etc.)
  - Endpoint URL: e.g., `http://localhost:11434/v1/chat/completions`
  - Remote OpenAI-compatible endpoints are also supported; TransLens will request access to the endpoint's domain when you save or test it

**Language Settings:**

- **Source Language**: The language you want to learn (e.g., Chinese)
- **Target Language**: Your native language for translations (e.g., English)

**Learning Mode:**

- **Vocabulary Mode**: Annotates individual words with translations

**SRS Settings:**

- **Interval Multiplier**: How quickly review intervals grow (default: 2.5x)
- **Max New Words/Day**: Limit how many new words appear daily
- **Mastery Threshold**: How many successful reviews before a word is "mastered"

### Step 3: Start Learning!

1. Visit any website in your target language
2. TransLens will automatically annotate unfamiliar words
3. Hover over annotations to see translations
4. The extension tracks which words you know using spaced repetition

### Step 4: Manage Websites

**Disable on Specific Sites:**

1. Click the extension icon
2. Click "Disable this website" to turn off translation
3. Manage disabled sites in Settings → Disabled Sites

### Tips for Best Results

- **Start small**: Set a lower "Max New Words/Day" (20-30) to avoid overwhelm
- **Be consistent**: Browse content in your target language daily
- **Use varied content**: News, blogs, forums – the more context, the better
- **Review regularly**: Words you've marked as "unknown" will reappear for review

### Troubleshooting

**No annotations appearing:**
- Check that you've entered a valid API key
- Ensure the website contains text in your source language
- Check if the website is in the Disabled Sites list

**Translation errors:**
- Verify your API key has available credits
- For custom endpoints, ensure the server is running

**Slow performance:**
- Reduce the "Selection Ratio" to annotate fewer words
- Reduce "Max Translations / Page" in Settings

---

**Need help?** Use the support contact listed on the Chrome Web Store listing.

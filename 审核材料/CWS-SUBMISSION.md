# Chrome Web Store 提交材料 - TransLens v2.2

---

## 1. 基本信息

### 名称
**TransLens**（中文名：**翻译透镜-语言学习工具**）

### 商店显示名（Chrome 会根据用户语言自动选择）
- 英文：`TransLens - Language Learning Tool`
- 中文（zh-CN）：`翻译透镜-语言学习工具`

### 版本
2.1

### 主分类
Productivity

### 副分类
Language Learning

### 简短描述（≤132 字符）
Learn languages while browsing! AI-powered vocabulary annotation with SRS spaced repetition.

### 中文简短描述（≤132 字符）
浏览网页学外语！AI 智能标注生词，配合间隔重复算法高效记忆词汇。

---

## 2. 完整描述（Full Description）— 纯文本，直接复制

TransLens / 翻译透镜-语言学习工具

Learn vocabulary naturally while browsing the web. TransLens automatically detects foreign language text on any page, annotates unfamiliar words with AI-powered translations, and tracks your learning progress using spaced repetition.

【简介】
翻译透镜（TransLens）是一款智能语言学习助手，帮助你在浏览网页时自然地积累词汇。

KEY FEATURES | 核心功能

📚 Learn in Context | 语境中学习
- Automatically detects foreign language text on web pages | 自动检测网页上的外语文本
- Annotates unfamiliar words with translations inline | 用翻译内联标注不熟悉的单词
- Supports Chinese, Japanese, Korean, French, German, Spanish, Russian, Arabic and more | 支持中文、日文、韩文、法文、德文、西班牙文、俄文、阿拉伯文等
- Skips form input fields (search boxes, textareas) to avoid interfering with user input | 自动跳过搜索框和文本输入区域，不干扰用户输入

🧠 Spaced Repetition (SRS) | 间隔重复
- Built-in SM-2 algorithm (same as Anki) | 内置 SM-2 算法（与 Anki 相同）
- Reviews words just before you forget them | 在遗忘前提醒你复习
- Tracks mastery progress for each word | 跟踪每个单词的掌握程度

🤖 AI-Powered Translation | AI 驱动翻译
- Choose from OpenAI GPT-4o, Anthropic Claude, or a custom OpenAI-compatible API | 可选择 OpenAI GPT-4o、Anthropic Claude 或自定义兼容 API
- Context-aware translations based on sentence meaning | 基于句子语境的智能翻译
- Custom endpoint support for remote or local compatible servers | 支持远程或本地自建服务器

️ Fully Customizable | 高度可定制
- Select source and target languages | 选择源语言和目标语言
- Adjust word selection ratio | 调整单词选择比例
- Set daily new word limits | 设置每日新词数量上限
- Disable on specific websites | 在特定网站上禁用
- Add disabled sites manually or use wildcards (e.g. *.example.com) | 手动添加禁用网站，支持通配符匹配（如 *.example.com）

🔒 Privacy First | 隐私优先
- All data stored locally in your browser | 所有数据存储在浏览器本地
- No accounts, no tracking, no analytics | 无需账号、无追踪、无分析
- Text snippets and API credentials are sent only to the AI provider you configure | 文本片段和 API 凭据仅发送给你配置的 AI 提供商

HOW TO USE | 使用方法

1. Install TransLens from Chrome Web Store | 从 Chrome 应用商店安装 TransLens
2. Click the extension icon to open Settings | 点击扩展图标打开设置
3. Enter your OpenAI/Anthropic API key or configure a custom endpoint | 输入 OpenAI/Anthropic API 密钥或配置自定义端点
4. Select the languages you want to learn | 选择你想学习的语言
5. Browse any foreign language website - TransLens will do the rest! | 浏览任何外语网站，TransLens 会自动为你标注！
6. Manage disabled sites in Settings to skip specific websites or entire domains | 在设置中管理禁用网站，可跳过特定网站或整个域名

SUPPORTED LANGUAGES | 支持的语言

Source Languages: Chinese (Simplified/Traditional), Japanese, Korean, French, German, Spanish, Russian, Arabic, or custom regex | 源语言：中文（简体/繁体）、日文、韩文、法文、德文、西班牙文、俄文、阿拉伯文，或自定义正则表达式
Target Languages: English, Chinese, Japanese, Korean, French, German, Spanish | 目标语言：英文、中文、日文、韩文、法文、德文、西班牙文

TECHNICAL NOTES | 技术说明

- Requires your own API key for OpenAI/Anthropic, or a compatible custom server | 需要自备 OpenAI/Anthropic API 密钥或兼容的自定义服务器
- Works with local AI servers (Ollama, llama.cpp, etc.) | 支持本地 AI 服务器（Ollama、llama.cpp 等）
- All settings and learning data stored in chrome.storage.local | 所有设置和学习数据存储在 chrome.storage.local

PRIVACY POLICY | 隐私政策

TransLens does not operate a developer server, does not use analytics, and does not sell user data. To provide translations, the extension sends the selected word and surrounding text directly to the AI provider configured by the user. Full privacy policy: https://eatmelon-masses.github.io/privacy-policy/extensions/translens/

翻译透镜不运营开发者服务器，不使用分析工具，不出售用户数据。为提供翻译功能，扩展会将选中的单词及其上下文文本直接发送给用户配置的 AI 提供商。完整隐私政策：https://eatmelon-masses.github.io/privacy-policy/extensions/translens/

---

## 3. 隐私权规范（Privacy Practices）— 审核用

以下所有内容均填写在"隐私权规范"标签页中。

### 3.1 单一用途（Single Purpose）

```
TransLens detects foreign language text on web pages and annotates unfamiliar words with AI-powered translations, while tracking learning progress using a spaced repetition algorithm - all within the browser. It skips form input fields (search boxes, text areas) to avoid interfering with user input.
```

### 3.2 Storage 权限说明

```
TransLens uses chrome.storage.local to save user settings (API provider, language preferences, display options) and learning data (word history, translations, review intervals, mastery status). It also stores the user-managed disabled sites list (including wildcard patterns) locally. This data is used exclusively by the extension locally and is never transmitted to developer-controlled servers.
```

### 3.3 ActiveTab 权限说明

```
TransLens uses the activeTab permission to determine the current website URL when the user opens the popup, allowing them to enable or disable TransLens for that specific site via the popup toggle button.
```

### 3.4 主机权限说明（Host Permissions）

**这是审核重点，需要详细解释为什么需要访问所有网站：**

```
TransLens requires access to all websites (http://*/* and https://*/*) because it is a language learning extension that must read text content on any web page the user visits.

Why broad host access is necessary:
1. The extension's content script runs on web pages to detect foreign language text (Chinese, Japanese, Korean, French, German, Spanish, Russian, Arabic, etc.)
2. Users browse websites in any language - we cannot predict or limit which sites they will visit for language learning
3. The extension only reads visible text content from the page DOM to identify words for annotation
4. Form input fields (search boxes, textareas) are explicitly skipped to avoid interfering with user input
5. No sensitive user data is accessed - only visible page text is processed

What the extension does NOT do:
- Does not access browsing history, cookies, passwords, or form inputs
- Does not modify page content beyond adding inline vocabulary annotations
- Does not transmit page content to developer-controlled servers
- Does not track user behavior across websites

All data processing happens locally in the browser. Page text is sent only to the user's chosen AI translation provider (OpenAI, Anthropic, or a custom endpoint) for vocabulary translation, and is not stored or logged.
```

### 3.5 远程代码（Remote Code）说明

```
TransLens does NOT use remote code. All extension code (JavaScript, HTML, CSS) is bundled locally within the extension package. The extension only makes API calls to external translation services (OpenAI, Anthropic, or user-configured custom endpoints) to obtain translations - no code is downloaded or executed from remote servers.
```

### 3.6 数据使用确认（Data Usage Declaration）

在开发者控制台中勾选以下确认项：

- [x] 我的扩展遵守 Chrome Web Store 用户数据政策
- [x] 我的扩展遵守有限使用要求（Limited Use requirements）
- [x] 我的扩展不出售用户数据
- [x] 我的扩展不将用户数据用于广告
- [x] 我的扩展不包含分析工具、追踪 Cookie 或行为追踪代码

---

## 4. 隐私政策 URL

```
https://eatmelon-masses.github.io/privacy-policy/extensions/translens/
```

---

## 5. 截图（Screenshots）

上传 `审核材料/cropped/1.png`、`审核材料/cropped/2.png`、`审核材料/cropped/3.png`
尺寸：1280x800

---

## 6. 上传包

上传 `translate/TransLens-2.1.zip`（通过 `bash translate/package.sh` 生成）

---

## 7. 开发者联系邮箱

（使用你注册的开发者邮箱）

---

生成时间：2026-06-27
对应版本：TransLens v2.1

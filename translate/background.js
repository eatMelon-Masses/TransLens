// Background Service Worker — 处理所有 AI API 调用
// 避免 content script 直接发起请求时的 CORS 限制

// ─── 右键菜单 ──────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "translate-selection",
    title: "翻译选中文本",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "translate-selection") {
    chrome.tabs.sendMessage(tab.id, { type: "TRANSLATE_CONTEXT" });
  }
});

// ─── 快捷键 ────────────────────────────────────────────

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "translate-selection") {
    chrome.tabs.sendMessage(tab.id, { type: "TRANSLATE_HOTKEY" });
  }
});

// ─── 翻译消息处理 ──────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "TRANSLATE") {
    handleTranslate(message.payload)
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message }));
    return true; // 保持消息通道开放（异步 sendResponse）
  }
});

function normalizeTextField(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function isUsableTranslation(value) {
  const text = normalizeTextField(value);
  if (!text) return false;
  if (text.length > 80) return false;
  // 超过 5 个英文单词，大概率包含了上下文（单个中文词不应翻译成整句）
  if (text.split(/\s+/).length > 5) return false;
  if ((text.startsWith("{") && text.endsWith("}")) || (text.startsWith("[") && text.endsWith("]"))) {
    return false;
  }
  if (/"translation"\s*:/.test(text) || /"phonetic"\s*:/.test(text)) {
    return false;
  }
  if (/[.!?。！？]/.test(text)) {
    return false;
  }
  return true;
}

function escapeControlCharsInJsonStrings(jsonText) {
  let result = "";
  let inString = false;
  let escaped = false;

  for (const char of jsonText) {
    if (!inString) {
      result += char;
      if (char === '"') inString = true;
      continue;
    }

    if (escaped) {
      result += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      result += char;
      escaped = true;
    } else if (char === '"') {
      result += char;
      inString = false;
    } else if (char === "\n") {
      result += "\\n";
    } else if (char === "\r") {
      result += "\\r";
    } else if (char === "\t") {
      result += "\\t";
    } else {
      result += char;
    }
  }

  return result;
}

function escapeControlCharsInJsonStringValue(value) {
  return value
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

function readJsonStringField(text, fieldName) {
  const marker = new RegExp(`"${fieldName}"\\s*:\\s*"`, "i");
  const match = marker.exec(text);
  if (!match) return "";

  let raw = "";
  let escaped = false;
  for (let i = match.index + match[0].length; i < text.length; i++) {
    const char = text[i];
    if (escaped) {
      raw += "\\" + char;
      escaped = false;
    } else if (char === "\\") {
      escaped = true;
    } else if (char === '"') {
      break;
    } else {
      raw += char;
    }
  }

  try {
    return JSON.parse(`"${escapeControlCharsInJsonStringValue(raw)}"`);
  } catch (e) {
    return raw;
  }
}

// ─── 健壮 JSON 解析管道 ─────────────────────────────────────
// 参考 LangChain parse_partial_json + Vercel AI SDK extractJsonMiddleware
// 四层防御：stripThinking → stripMarkdown → bracketDepth → tryParse/fallback

function stripThinkingBlocks(text) {
  // MiniMax / DeepSeek 等推理模型会把思考过程嵌在 content 里
  // 格式有 <think>...</think> 和  ...，均需去除
  return text.replace(/<think>[\s\S]*?<\/think(?:ing)?>/gi, "").trim();
}

function extractJsonFromMarkdown(text) {
  // 有些模型把 JSON 包在 ```json ... ``` 里，提取围栏内容
  const fenceMatch = text.match(/```(?:json|JSON)?\s*\n?([\s\S]*?)\n?\s*```/);
  return fenceMatch ? fenceMatch[1].trim() : text;
}

function extractJsonObject(text) {
  // 括号深度计数器，正确处理字符串内的 { } 嵌套
  // 替代有缺陷的贪婪正则 /\{[\s\S]*\}/
  const start = text.indexOf("{");
  if (start === -1) return "";

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (escaped) { escaped = false; continue; }
    if (char === "\\" && inString) { escaped = true; continue; }
    if (char === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (char === "{") depth++;
    else if (char === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  // fallback：取到最后一个 }（处理截断 JSON）
  const end = text.lastIndexOf("}");
  return end > start ? text.slice(start, end + 1) : "";
}

function tryParseJson(jsonText) {
  // 三层解析：直接 parse → 修控制字符 → 正则字段提取兜底
  // 每层都校验 translation 字段有效性
  const buildResult = (parsed) => {
    const translation = normalizeTextField(parsed.translation);
    if (!isUsableTranslation(translation)) return null;
    return {
      targetWord: null,
      translation,
      phonetic: normalizeTextField(parsed.phonetic)
    };
  };

  // Layer 1：直接 parse
  try {
    const result = buildResult(JSON.parse(jsonText));
    if (result) return result;
  } catch (_) {}

  // Layer 2：转义字符串内的控制字符（未转义换行符是最常见的 LLM JSON 错误）
  try {
    const result = buildResult(JSON.parse(escapeControlCharsInJsonStrings(jsonText)));
    if (result) return result;
  } catch (_) {}

  // Layer 3：正则提取字段（处理 JSON.parse 完全失败的情况）
  const translation = normalizeTextField(readJsonStringField(jsonText, "translation"));
  const phonetic = normalizeTextField(readJsonStringField(jsonText, "phonetic"));
  if (isUsableTranslation(translation)) {
    return { targetWord: null, translation, phonetic };
  }
  return null;
}

function parseTranslationContent(content) {
  const raw = String(content || "");

  // 管道：去 thinking 块 → 去 markdown 围栏 → 括号计数器提取 JSON
  const cleaned = extractJsonFromMarkdown(stripThinkingBlocks(raw));
  const jsonText = extractJsonObject(cleaned);

  if (jsonText) {
    const result = tryParseJson(jsonText);
    if (result) return result;
  }

  // fallback：清理后的文本本身作为翻译（纯文本响应，无 JSON）
  if (isUsableTranslation(cleaned)) {
    return { targetWord: null, translation: cleaned, phonetic: "" };
  }

  return { error: "模型返回内容无法解析为有效翻译" };
}

async function handleTranslate({ sentence, targetWord, sourceLang, targetLang, settings }) {
  const { provider, apiKey, model, customUrl } = settings;

  if (!apiKey && provider !== "custom") {
    return { error: "请先在 Settings 中配置 API Key" };
  }

  // 让 AI 返回翻译和翻译结果的发音（JSON 格式）
  // phonetic 始终对应 translation，而不是原文 targetWord，避免中文源词被返回拼音。
  const prompt = `Translate ONLY the target word to ${targetLang}. Return ONLY a JSON object: {"translation": "...", "phonetic": "/.../"}

Target word: ${targetWord}
Sentence context (for meaning disambiguation ONLY — do NOT translate these): ${sentence}

STRICT RULES (violation = wrong output):
1. Translate ONLY "${targetWord}" — absolutely nothing else.
2. If the sentence contains "分区调整" and target word is "调整", return "adjustment", NEVER "partition adjustment".
3. If the sentence contains "更加方便" and target word is "更加", return "more", NEVER "more convenient".
4. The translation must be 1 word (preferred) or at most 3 words.

Phonetic rules:
- Phonetic is for the ${targetLang} translation, using ${targetLang} IPA (e.g. government -> /ˈɡʌvənmənt/).
- Do NOT return pinyin unless ${targetLang} is Chinese.
- Keep phonetic between slashes. If unsure, use empty string.`;

  switch (provider) {
    case "openai":
      return callOpenAI(prompt, apiKey, model);
    case "anthropic":
      return callAnthropic(prompt, apiKey, model);
    case "custom": {
      // thinking 模型（deepseek-v4-flash 等）推理过程较长，精简 prompt 以减少 token 消耗
      const compactPrompt =
        `Translate ONLY "${targetWord}" to ${targetLang}. Context: "${sentence}"\n` +
        `Return JSON: {"translation": "...", "phonetic": "/IPA/"}\n` +
        `STRICT: translate only the target word "${targetWord}", NOT surrounding words. ` +
        `Max 3 words in translation.`;
      return callCustom(compactPrompt, apiKey, model, customUrl);
    }
    default:
      return { error: `Unknown provider: ${provider}` };
  }
}

// ─── OpenAI ───────────────────────────────────────────────

async function callOpenAI(prompt, apiKey, model) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a precise translator. Return JSON with translation and phonetic." },
        { role: "user", content: prompt },
      ],
      max_tokens: 80,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API ${response.status}: ${err}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content.trim();

  return parseTranslationContent(content);
}

// ─── Anthropic ────────────────────────────────────────────

async function callAnthropic(prompt, apiKey, model) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: model || "claude-sonnet-4-20250514",
      max_tokens: 80,
      temperature: 0.3,
      system: "You are a precise translator. Return JSON with translation and phonetic.",
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API ${response.status}: ${err}`);
  }

  const data = await response.json();
  const content = data.content[0].text.trim();

  return parseTranslationContent(content);
}

// ─── Custom (OpenAI-compatible) ───────────────────────────

async function callCustom(prompt, apiKey, model, customUrl) {
  const url = customUrl || "http://localhost:11434/v1/chat/completions";
  const headers = { "Content-Type": "application/json" };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: model || "",
      messages: [
        { role: "system", content: "Return JSON: {\"translation\":\"...\",\"phonetic\":\"/IPA/\"}" },
        { role: "user", content: prompt },
      ],
      max_tokens: 4096,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Custom API ${response.status}: ${err}`);
  }

  const data = await response.json();

  // thinking 模型（如 deepseek-v4-flash）可能将推理过程放在 reasoning_content，content 为空
  // 或把 <think> 块嵌入 content 里（MiniMax-M2.5）——先去除再判空
  const message = data.choices?.[0]?.message;
  const rawContent = (message?.content || "").trim();
  const content = stripThinkingBlocks(rawContent);

  if (!content) {
    throw new Error(
      `"${model || '当前模型'}" 返回为空，可能是推理模型 token 耗尽。` +
      `请重试或换用非推理模型（如 deepseek-chat）`
    );
  }

  return parseTranslationContent(content);
}

// Background Service Worker — 处理所有 AI API 调用
// 避免 content script 直接发起请求时的 CORS 限制

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
  if (text.length > 160) return false;
  if ((text.startsWith("{") && text.endsWith("}")) || (text.startsWith("[") && text.endsWith("]"))) {
    return false;
  }
  if (/"translation"\s*:/.test(text) || /"phonetic"\s*:/.test(text)) {
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

function parseTranslationContent(content) {
  const text = String(content || "").trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  const jsonText = jsonMatch ? jsonMatch[0] : "";

  if (jsonText) {
    try {
      const parsed = JSON.parse(jsonText);
      const translation = normalizeTextField(parsed.translation);
      if (!isUsableTranslation(translation)) {
        return { error: "模型返回的 JSON 缺少有效 translation 字段" };
      }
      return {
        targetWord: null,
        translation,
        phonetic: normalizeTextField(parsed.phonetic)
      };
    } catch (e) {
      try {
        const parsed = JSON.parse(escapeControlCharsInJsonStrings(jsonText));
        const translation = normalizeTextField(parsed.translation);
        if (!isUsableTranslation(translation)) {
          return { error: "模型返回的 JSON 缺少有效 translation 字段" };
        }
        return {
          targetWord: null,
          translation,
          phonetic: normalizeTextField(parsed.phonetic)
        };
      } catch (err) {
        const translation = normalizeTextField(readJsonStringField(jsonText, "translation"));
        const phonetic = normalizeTextField(readJsonStringField(jsonText, "phonetic"));
        if (isUsableTranslation(translation)) {
          return {
            targetWord: null,
            translation,
            phonetic
          };
        }
        return { error: "模型返回的 JSON 无法解析出有效翻译" };
      }
    }
  }

  if (!isUsableTranslation(text)) {
    return { error: "模型返回内容不是可展示的短翻译" };
  }

  return {
    targetWord: null,
    translation: text,
    phonetic: ""
  };
}

async function handleTranslate({ sentence, targetWord, sourceLang, targetLang, settings }) {
  const { provider, apiKey, model, customUrl } = settings;

  if (!apiKey && provider !== "custom") {
    return { error: "请先在 Settings 中配置 API Key" };
  }

  // 让 AI 返回翻译和翻译结果的发音（JSON 格式）
  // phonetic 始终对应 translation，而不是原文 targetWord，避免中文源词被返回拼音。
  const prompt = `Translate the word "${targetWord}" in the following ${sourceLang} sentence to ${targetLang}.
Return ONLY a JSON object with this format: {"translation": "translated meaning", "phonetic": "/pronunciation of translated meaning/"}

Rules for phonetic:
- Phonetic MUST be for the translation in ${targetLang}, not for the original ${sourceLang} word.
- If ${targetLang} is English, use English IPA, for example government -> /ˈɡʌvənmənt/.
- If the translation is a short phrase, provide readable IPA for the phrase.
- Do not return pinyin unless ${targetLang} is Chinese.
- Keep phonetic between slashes. If unsure, use an empty string.

Sentence: ${sentence}`;

  switch (provider) {
    case "openai":
      return callOpenAI(prompt, apiKey, model);
    case "anthropic":
      return callAnthropic(prompt, apiKey, model);
    case "custom": {
      // thinking 模型（deepseek-v4-flash 等）推理过程较长，精简 prompt 以减少 token 消耗
      const compactPrompt =
        `Translate "${targetWord}" (${sourceLang}) to ${targetLang} in this sentence:\n` +
        `"${sentence}"\n` +
        `Return JSON only: {"translation": "...", "phonetic": "/IPA of translation/"}`;
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
  const message = data.choices?.[0]?.message;
  const content = (message?.content || "").trim();

  if (!content) {
    throw new Error(
      `"${model || '当前模型'}" 返回为空，可能是推理模型 token 耗尽。` +
      `请重试或换用非推理模型（如 deepseek-chat）`
    );
  }

  return parseTranslationContent(content);
}

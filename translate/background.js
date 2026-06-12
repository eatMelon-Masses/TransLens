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

async function handleTranslate({ sentence, targetWord, sourceLang, targetLang, settings }) {
  const { provider, apiKey, model, customUrl } = settings;

  if (!apiKey && provider !== "custom") {
    return { error: "请先在 Settings 中配置 API Key" };
  }

  // 让 AI 返回翻译和音标（JSON 格式）
  // 音标用简化 IPA，不带声调符号（类似有道、百度翻译）
  const prompt = `Translate the word "${targetWord}" in the following ${sourceLang} sentence to ${targetLang}.
Return ONLY a JSON object with this format: {"translation": "english meaning", "phonetic": "/pronunciation/"}

Rules for phonetic:
- Use simplified IPA without tone marks
- For Chinese: /ʈʂəŋ fǔ/ (not /ʈʂəŋ˥˩ fǔ˨˩/)
- For English: /ˈɡʌvənmənt/
- Keep phonetic between slashes

Sentence: ${sentence}`;

  switch (provider) {
    case "openai":
      return callOpenAI(prompt, apiKey, model);
    case "anthropic":
      return callAnthropic(prompt, apiKey, model);
    case "custom":
      return callCustom(prompt, apiKey, model, customUrl);
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

  // 解析 AI 返回的 JSON（包含翻译和音标）
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        targetWord: null,
        translation: parsed.translation || content,
        phonetic: parsed.phonetic || ""
      };
    }
  } catch (e) {
    // JSON 解析失败，返回纯翻译
  }

  return {
    targetWord: null,
    translation: content,
    phonetic: ""
  };
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

  // 解析 AI 返回的 JSON（包含翻译和音标）
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        targetWord: null,
        translation: parsed.translation || content,
        phonetic: parsed.phonetic || ""
      };
    }
  } catch (e) {
    // JSON 解析失败，返回纯翻译
  }

  return {
    targetWord: null,
    translation: content,
    phonetic: ""
  };
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
        { role: "system", content: "You are a precise translator. Return JSON with translation and phonetic." },
        { role: "user", content: prompt },
      ],
      max_tokens: 80,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Custom API ${response.status}: ${err}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content.trim();

  // 解析 AI 返回的 JSON（包含翻译和音标）
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        targetWord: null,
        translation: parsed.translation || content,
        phonetic: parsed.phonetic || ""
      };
    }
  } catch (e) {
    // JSON 解析失败，返回纯翻译
  }

  return {
    targetWord: null,
    translation: content,
    phonetic: ""
  };
}

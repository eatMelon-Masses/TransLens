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

  if (!apiKey) {
    return { error: "请先在 Settings 中配置 API Key" };
  }

  const prompt = `Translate the word "${targetWord}" in the following ${sourceLang} sentence to ${targetLang}. Only give the translation, no explanation.\n\nSentence: ${sentence}`;

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
        { role: "system", content: "You are a precise translator." },
        { role: "user", content: prompt },
      ],
      max_tokens: 50,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API ${response.status}: ${err}`);
  }

  const data = await response.json();
  return {
    targetWord: null,
    translation: data.choices[0].message.content.trim(),
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
      max_tokens: 50,
      temperature: 0.3,
      system: "You are a precise translator.",
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API ${response.status}: ${err}`);
  }

  const data = await response.json();
  return {
    targetWord: null,
    translation: data.content[0].text.trim(),
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
        { role: "system", content: "You are a precise translator." },
        { role: "user", content: prompt },
      ],
      max_tokens: 50,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Custom API ${response.status}: ${err}`);
  }

  const data = await response.json();
  return {
    targetWord: null,
    translation: data.choices[0].message.content.trim(),
  };
}

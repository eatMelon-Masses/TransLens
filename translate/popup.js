// Popup — 状态显示 + 设置入口

document.addEventListener("DOMContentLoaded", async () => {
  const { settings } = await chrome.storage.local.get("settings");
  const { srsData } = await chrome.storage.local.get("srsData");

  const s = settings || {};
  const words = srsData ? Object.values(srsData) : [];

  // 获取当前网站域名
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const currentHost = tab?.url ? new URL(tab.url).hostname : "";
  const disabledSites = s.disabledSites || [];
  const isDisabled = disabledSites.includes(currentHost);

  // Provider
  const provider = s.provider || "openai";
  const providerConfig = s.providers?.[provider] || {};
  const providerNames = { openai: "OpenAI", anthropic: "Anthropic", custom: "Custom" };
  document.getElementById("providerDisplay").textContent = providerNames[provider] || "—";

  // API Key / Custom endpoint
  const keyEl = document.getElementById("keyDisplay");
  const hasProviderConfig = provider === "custom"
    ? Boolean(providerConfig.customUrl || providerConfig.apiKey)
    : Boolean(providerConfig.apiKey || s.apiKey);

  if (hasProviderConfig) {
    keyEl.textContent = "Configured";
    keyEl.className = "status-value ok";
  } else {
    keyEl.textContent = "Not set";
    keyEl.className = "status-value err";
  }

  // Languages
  const langNames = {
    "en": "English", "zh-CN": "中文", "zh-TW": "繁體中文", ja: "日本語", ko: "한국어",
    fr: "Français", de: "Deutsch", es: "Español", ru: "Русский", ar: "العربية",
  };
  const src = langNames[s.sourceLang] || s.sourceLang || "—";
  const tgt = langNames[s.targetLang] || s.targetLang || "—";
  document.getElementById("langDisplay").textContent = `${src} → ${tgt}`;

  // Word count
  document.getElementById("wordCount").textContent = words.length;

  // Level display
  if (s.learnerLevel) {
    const levelRow = document.getElementById("levelRow");
    const levelDisp = document.getElementById("levelDisplay");
    levelRow.style.display = "flex";
    levelDisp.textContent = s.learnerLevel + (s.estimatedVocabulary ? ` (~${s.estimatedVocabulary.toLocaleString()})` : "");
  }

  // Toggle Site Button
  const toggleBtn = document.getElementById("toggleSite");
  toggleBtn.textContent = isDisabled ? "启用此网站" : "禁用此网站";
  toggleBtn.classList.toggle("btn-danger", isDisabled);
  toggleBtn.classList.toggle("btn-secondary", !isDisabled);

  toggleBtn.addEventListener("click", async () => {
    if (!currentHost) return;

    const newDisabledSites = isDisabled
      ? disabledSites.filter(site => site !== currentHost)
      : [...disabledSites, currentHost];

    await chrome.storage.local.set({
      settings: { ...s, disabledSites: newDisabledSites }
    });

    // 刷新按钮状态
    toggleBtn.textContent = isDisabled ? "禁用此网站" : "启用此网站";
    toggleBtn.classList.toggle("btn-danger");
    toggleBtn.classList.toggle("btn-secondary");

    // 如果启用了网站，刷新页面以激活动能
    if (isDisabled && tab?.id) {
      chrome.tabs.reload(tab.id);
    }
  });

  // Open Settings
  document.getElementById("openSettings").addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("settings.html") });
    window.close();
  });
});

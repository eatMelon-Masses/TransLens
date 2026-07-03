// Settings Page — 逻辑

const $ = (id) => document.getElementById(id);

function bindRadio(name, value) {
  const input = document.querySelector(`input[name="${name}"][value="${value}"]`);
  if (input) input.checked = true;
}

function getOriginPattern(url) {
  try {
    const endpoint = new URL(url);
    if (endpoint.protocol !== "http:" && endpoint.protocol !== "https:") return null;
    return `${endpoint.protocol}//${endpoint.host}/*`;
  } catch (err) {
    return null;
  }
}

async function ensureCustomEndpointPermission(url) {
  const origin = getOriginPattern(url);
  if (!origin) {
    throw new Error("Please enter a valid http:// or https:// endpoint URL.");
  }

  const hasPermission = await chrome.permissions.contains({ origins: [origin] });
  if (hasPermission) return true;

  const granted = await chrome.permissions.request({ origins: [origin] });
  if (!granted) {
    throw new Error("Permission is required to connect to this custom endpoint.");
  }

  return true;
}

document.addEventListener("DOMContentLoaded", async () => {
  const defaults = {
    provider: "openai",
    apiKey: "",
    model: "",
    customUrl: "",
    sourceLang: "zh-CN",
    targetLang: "en",
    customRegex: "",
    mode: "vocabulary",
    selectRatio: 40,
    minWordLen: 2,
    maxPhraseLen: 6,
    maxTranslationsPerPage: 30,
    annotationScale: 110,
    intervalMultiplier: 2.5,
    maxNewWords: 50,
    masteryThreshold: 6,
  };

  // Load saved settings
  const stored = await chrome.storage.local.get("settings");
  let settings = stored.settings || { ...defaults };

  const defaultProviders = {
    openai: { apiKey: "", model: "" },
    anthropic: { apiKey: "", model: "" },
    custom: { apiKey: "", customUrl: "", model: "" }
  };

  // 兼容旧版配置：如果是扁平结构，转换为按 provider 分开存储
  function migrateSettings(s) {
    if (s.providers) return s; // 已经是新版格式
    return {
      provider: s.provider || defaults.provider,
      providers: {
        openai: { apiKey: s.apiKey || "", model: s.model || "" },
        anthropic: { apiKey: s.anthropicApiKey || "", model: s.anthropicModel || "" },
        custom: { apiKey: s.customApiKey || "", customUrl: s.customUrl || "", model: s.customModel || "" }
      },
      sourceLang: s.sourceLang || defaults.sourceLang,
      targetLang: s.targetLang || defaults.targetLang,
      customRegex: s.customRegex || "",
      mode: s.mode || defaults.mode,
      selectRatio: s.selectRatio || defaults.selectRatio,
      minWordLen: s.minWordLen || defaults.minWordLen,
      maxPhraseLen: s.maxPhraseLen || defaults.maxPhraseLen,
      maxTranslationsPerPage: s.maxTranslationsPerPage || defaults.maxTranslationsPerPage,
      annotationScale: s.annotationScale || defaults.annotationScale,
      intervalMultiplier: s.intervalMultiplier || defaults.intervalMultiplier,
      maxNewWords: s.maxNewWords || defaults.maxNewWords,
      masteryThreshold: s.masteryThreshold || defaults.masteryThreshold,
      disabledSites: s.disabledSites || []
    };
  }

  settings = migrateSettings(settings);

  settings.providers = {
    openai: { ...defaultProviders.openai, ...settings.providers?.openai },
    anthropic: { ...defaultProviders.anthropic, ...settings.providers?.anthropic },
    custom: { ...defaultProviders.custom, ...settings.providers?.custom }
  };

  bindRadio("provider", settings.provider || "openai");
  bindRadio("mode", settings.mode);
  let currentProvider = settings.provider || "openai";


  $("sourceLang").value = settings.sourceLang || defaults.sourceLang;
  $("targetLang").value = settings.targetLang || defaults.targetLang;
  $("customRegex").value = settings.customRegex || "";
  $("selectRatio").value = settings.selectRatio || defaults.selectRatio;
  $("ratioValue").textContent = (settings.selectRatio || defaults.selectRatio) + "%";
  $("minWordLen").value = settings.minWordLen || defaults.minWordLen;
  $("maxPhraseLen").value = settings.maxPhraseLen || defaults.maxPhraseLen;
  $("maxTranslationsPerPage").value = settings.maxTranslationsPerPage || defaults.maxTranslationsPerPage;
  $("annotationScale").value = settings.annotationScale || defaults.annotationScale;
  $("annotationScaleValue").textContent = (settings.annotationScale || defaults.annotationScale) + "%";
  $("intervalMultiplier").value = settings.intervalMultiplier || defaults.intervalMultiplier;
  $("maxNewWords").value = settings.maxNewWords || defaults.maxNewWords;
  $("masteryThreshold").value = settings.masteryThreshold || defaults.masteryThreshold;

  function saveProviderForm(provider) {
    if (!settings.providers[provider]) {
      settings.providers[provider] = { ...defaultProviders[provider] };
    }

    if (provider === "custom") {
      settings.providers.custom = {
        ...settings.providers.custom,
        apiKey: $("apiKey").value.trim(),
        customUrl: $("customUrl").value.trim(),
        model: $("model").value.trim()
      };
      return;
    }

    settings.providers[provider] = {
      ...settings.providers[provider],
      apiKey: $("apiKey").value.trim(),
      model: $("model").value.trim()
    };
  }

  function loadProviderForm(provider) {
    const p = settings.providers[provider] || {};
    $("apiKey").value = p.apiKey || "";
    $("apiKey").placeholder = provider === "custom" ? "可选，用于需要 Bearer Token 的自定义接口" : "sk-...";
    $("model").value = p.model || "";
    $("customUrl").value = provider === "custom" ? (p.customUrl || "") : "";
    $("customUrlGroup").classList.toggle("hidden", provider !== "custom");
  }

  function switchProvider(provider) {
    if (provider === currentProvider) {
      loadProviderForm(provider);
      return;
    }

    saveProviderForm(currentProvider);
    currentProvider = provider;
    settings.provider = provider;
    loadProviderForm(provider);
  }

  // 切换时显示/隐藏对应字段，并恢复对应 provider 的值
  function updateProviderUI() {
    const provider = document.querySelector('input[name="provider"]:checked')?.value || "openai";
    switchProvider(provider);
  }

  document.querySelectorAll('input[name="provider"]').forEach((input) => {
    input.addEventListener("change", updateProviderUI);
  });

  // 初始化显示状态
  loadProviderForm(currentProvider);

  // Source language → custom regex
  $("sourceLang").addEventListener("change", (e) => {
    $("customRegexGroup").classList.toggle("hidden", e.target.value !== "custom");
  });
  if (settings.sourceLang === "custom") {
    $("customRegexGroup").classList.remove("hidden");
  }

  // Range slider
  $("selectRatio").addEventListener("input", (e) => {
    $("ratioValue").textContent = e.target.value + "%";
  });

  $("annotationScale").addEventListener("input", (e) => {
    $("annotationScaleValue").textContent = e.target.value + "%";
  });

  // Sidebar navigation
  document.querySelectorAll(".nav-item").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      const target = el.dataset.section;
      document.querySelector(`.nav-item.active`)?.classList.remove("active");
      el.classList.add("active");
      $(target)?.scrollIntoView({ behavior: "smooth" });
    });
  });

  // Update active nav on scroll
  const sections = document.querySelectorAll(".section");
  window.addEventListener("scroll", () => {
    let current = "";
    sections.forEach((sec) => {
      if (window.scrollY >= sec.offsetTop - 100) current = sec.id;
    });
    document.querySelectorAll(".nav-item").forEach((el) => {
      el.classList.toggle("active", el.dataset.section === current);
    });
  });

  // ─── Save ─────────────────────────────────────────────

  $("saveBtn").addEventListener("click", async () => {
    const provider = document.querySelector('input[name="provider"]:checked')?.value || "openai";
    const mode = document.querySelector('input[name="mode"]:checked')?.value || "vocabulary";

    saveProviderForm(provider);

    try {
      const customUrl = settings.providers.custom?.customUrl || "";
      if (provider === "custom" && customUrl) {
        await ensureCustomEndpointPermission(customUrl);
      }
    } catch (err) {
      $("saveBtn").textContent = err.message;
      setTimeout(() => ($("saveBtn").textContent = "Save Settings"), 2500);
      return;
    }

    // 实时读取 disabledSites，避免内存中的旧值覆盖用户在列表中的增删
    const { settings: latestSettings } = await chrome.storage.local.get("settings");
    const latestDisabled = latestSettings?.disabledSites || settings.disabledSites || [];

    const newSettings = {
      provider,
      providers: settings.providers,
      sourceLang: $("sourceLang").value,
      targetLang: $("targetLang").value,
      customRegex: $("customRegex").value.trim(),
      mode,
      selectRatio: parseInt($("selectRatio").value),
      minWordLen: parseInt($("minWordLen").value),
      maxPhraseLen: parseInt($("maxPhraseLen").value),
      maxTranslationsPerPage: parseInt($("maxTranslationsPerPage").value),
      annotationScale: parseInt($("annotationScale").value),
      intervalMultiplier: parseFloat($("intervalMultiplier").value),
      maxNewWords: parseInt($("maxNewWords").value),
      masteryThreshold: parseInt($("masteryThreshold").value),
      disabledSites: latestDisabled
    };

    await chrome.storage.local.set({ settings: newSettings });
    settings = newSettings;
    currentProvider = provider;
    $("saveBtn").textContent = "Saved!";
    setTimeout(() => ($("saveBtn").textContent = "Save Settings"), 1500);
  });

  // ─── Test Connection ─────────────────────────────────

  $("testBtn").addEventListener("click", async () => {
    const result = $("testResult");
    result.textContent = "Testing...";
    result.className = "test-result";

    const provider = document.querySelector('input[name="provider"]:checked')?.value || "openai";
    saveProviderForm(provider);
    const p = settings.providers[provider] || {};
    const apiKey = p.apiKey || "";
    const model = p.model || "";
    const customUrl = p.customUrl || "";

    if (!apiKey && provider !== "custom") {
      result.textContent = "Please enter an API Key";
      result.className = "test-result error";
      return;
    }

    if (provider === "custom" && customUrl) {
      try {
        await ensureCustomEndpointPermission(customUrl);
      } catch (err) {
        result.textContent = err.message;
        result.className = "test-result error";
        return;
      }
    }

    try {
      const resp = await chrome.runtime.sendMessage({
        type: "TRANSLATE",
        payload: {
          sentence: "Hello",
          targetWord: "hello",
          sourceLang: "en",
          targetLang: "en",
          settings: { provider, apiKey, model, customUrl },
        },
      });

      if (!resp) {
        result.textContent = "Failed: 未收到响应，请检查 Service Worker 是否正常运行";
        result.className = "test-result error";
      } else if (resp?.error) {
        result.textContent = "Failed: " + resp.error;
        result.className = "test-result error";
      } else if (resp?.translation) {
        result.textContent = "OK: " + resp.translation;
        result.className = "test-result success";
      } else {
        result.textContent = "Unexpected response: " + JSON.stringify(resp);
        result.className = "test-result error";
      }
    } catch (err) {
      result.textContent = "Error: " + err.message;
      result.className = "test-result error";
    }
  });

  // ─── Statistics ──────────────────────────────────────

  await updateStats();
  await updateDisabledSitesList();

  $("clearCacheBtn")?.addEventListener("click", async () => {
    if (confirm("Clear cached translations and SRS learning data? Provider settings will be kept.")) {
      await chrome.storage.local.remove(["srsData", "translationCache"]);
      location.reload();
    }
  });

  $("exportBtn")?.addEventListener("click", async () => {
    const { srsData } = await chrome.storage.local.get("srsData");
    const words = srsData ? Object.values(srsData) : [];
    const csv = words
      .map((w) => `${w.word},${w.translation || ""},${w.interval},${w.lastSeen}`)
      .join("\n");
    const blob = new Blob([`word,translation,interval,lastSeen\n${csv}`], {
      type: "text/csv",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "translens-wordlist.csv";
    a.click();
  });

  $("addDisabledBtn")?.addEventListener("click", async () => {
    const input = $("addDisabledInput");
    const value = (input?.value || "").trim().toLowerCase();
    if (!value) return;
    // 简单格式校验：至少包含一个点或以 * 开头
    if (!value.includes(".") && !value.startsWith("*")) {
      alert("请输入有效的域名，如 example.com 或 *.example.com");
      return;
    }
    const { settings: freshSettings } = await chrome.storage.local.get("settings");
    const s = freshSettings || {};
    const current = s.disabledSites || [];
    if (current.includes(value)) {
      input.value = "";
      return;
    }
    const updated = [...current, value];
    await chrome.storage.local.set({ settings: { ...s, disabledSites: updated } });
    settings.disabledSites = updated; // 同步内存，避免 Save 时覆盖
    input.value = "";
    await updateDisabledSitesList();
  });

  $("clearDisabledBtn")?.addEventListener("click", async () => {
    const { settings: freshSettings } = await chrome.storage.local.get("settings");
    const s = freshSettings || {};
    await chrome.storage.local.set({ settings: { ...s, disabledSites: [] } });
    settings.disabledSites = []; // 同步内存
    await updateDisabledSitesList();
  });
});

// ─── Helpers ────────────────────────────────────────────

async function updateStats() {
  const { srsData } = await chrome.storage.local.get("srsData");
  const words = srsData ? Object.values(srsData) : [];
  const now = Date.now();
  const dayMs = 86400000;

  const total = words.length;
  const mastered = words.filter((w) => w.repetitions >= 6).length;
  const due = words.filter((w) => w.nextReview <= now).length;
  const todayNew = words.filter(
    (w) => w.createdAt && w.createdAt > now - dayMs
  ).length;

  if ($("totalWords")) $("totalWords").textContent = total;
  if ($("masteredWords")) $("masteredWords").textContent = mastered;
  if ($("dueWords")) $("dueWords").textContent = due;
  if ($("todayNew")) $("todayNew").textContent = todayNew;
}

async function updateDisabledSitesList() {
  const { settings } = await chrome.storage.local.get("settings");
  const s = settings || {};
  const disabledSites = s.disabledSites || [];
  const container = document.getElementById("disabledSitesList");

  if (!container) return;

  if (disabledSites.length === 0) {
    container.innerHTML = '<p style="font-size: 13px; color: #9ca3af;">暂无禁用网站</p>';
  } else {
    container.innerHTML = disabledSites
      .map(site => `<span style="display:inline-flex;align-items:center;gap:4px;background:#f3f4f6;padding:4px 8px;border-radius:4px;margin:4px;font-size:13px;">${site}<button data-site="${site}" class="remove-disabled-btn" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:15px;padding:0 2px;line-height:1;" title="移除">×</button></span>`)
      .join("");
    // 绑定逐条删除事件
    container.querySelectorAll(".remove-disabled-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const target = btn.dataset.site;
        const { settings: freshSettings } = await chrome.storage.local.get("settings");
        const s = freshSettings || {};
        const updated = (s.disabledSites || []).filter(site => site !== target);
        await chrome.storage.local.set({ settings: { ...s, disabledSites: updated } });
        settings.disabledSites = updated; // 同步内存
        await updateDisabledSitesList();
      });
    });
  }
}

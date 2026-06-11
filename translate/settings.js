// Settings Page — 逻辑

document.addEventListener("DOMContentLoaded", async () => {
  const defaults = {
    provider: "openai",
    apiKey: "",
    model: "",
    customUrl: "http://localhost:11434/v1/chat/completions",
    sourceLang: "zh-CN",
    targetLang: "en",
    customRegex: "",
    mode: "vocabulary",
    selectRatio: 40,
    minWordLen: 2,
    intervalMultiplier: 2.5,
    maxNewWords: 50,
    masteryThreshold: 6,
  };

  // Load saved settings
  const stored = await chrome.storage.local.get("settings");
  const settings = stored.settings || { ...defaults };

  // Populate form
  const $ = (id) => document.getElementById(id);

  function bindRadio(name, value) {
    const el = document.querySelector(`input[name="${name}"][value="${value}"]`);
    if (el) el.checked = true;
  }

  bindRadio("provider", settings.provider);
  bindRadio("mode", settings.mode);
  $("apiKey").value = settings.apiKey || "";
  $("model").value = settings.model || "";
  $("customUrl").value = settings.customUrl || defaults.customUrl;
  $("sourceLang").value = settings.sourceLang || defaults.sourceLang;
  $("targetLang").value = settings.targetLang || defaults.targetLang;
  $("customRegex").value = settings.customRegex || "";
  $("selectRatio").value = settings.selectRatio || defaults.selectRatio;
  $("ratioValue").textContent = (settings.selectRatio || defaults.selectRatio) + "%";
  $("minWordLen").value = settings.minWordLen || defaults.minWordLen;
  $("intervalMultiplier").value = settings.intervalMultiplier || defaults.intervalMultiplier;
  $("maxNewWords").value = settings.maxNewWords || defaults.maxNewWords;
  $("masteryThreshold").value = settings.masteryThreshold || defaults.masteryThreshold;

  // Toggle provider-specific fields - 直接绑定到 label 卡片上
  function updateProviderUI() {
    const checkedProvider = document.querySelector('input[name="provider"]:checked');
    const provider = checkedProvider ? checkedProvider.value : "openai";
    console.log("[Provider changed to]:", provider);

    const customUrlGroup = $("customUrlGroup");
    if (customUrlGroup) {
      if (provider === "custom") {
        customUrlGroup.classList.remove("hidden");
      } else {
        customUrlGroup.classList.add("hidden");
      }
    }
  }

  // 给每个 provider card 的 label 绑定点击事件
  document.querySelectorAll(".provider-card").forEach((card) => {
    card.addEventListener("click", () => {
      setTimeout(updateProviderUI, 50); // 等待 radio 状态更新
    });
  });

  // 初始化显示状态
  setTimeout(updateProviderUI, 100);

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

    const newSettings = {
      provider,
      apiKey: $("apiKey").value.trim(),
      model: $("model").value.trim(),
      customUrl: $("customUrl").value.trim(),
      sourceLang: $("sourceLang").value,
      targetLang: $("targetLang").value,
      customRegex: $("customRegex").value.trim(),
      mode,
      selectRatio: parseInt($("selectRatio").value),
      minWordLen: parseInt($("minWordLen").value),
      intervalMultiplier: parseFloat($("intervalMultiplier").value),
      maxNewWords: parseInt($("maxNewWords").value),
      masteryThreshold: parseInt($("masteryThreshold").value),
    };

    await chrome.storage.local.set({ settings: newSettings });
    $("saveBtn").textContent = "Saved!";
    setTimeout(() => ($("saveBtn").textContent = "Save Settings"), 1500);
  });

  // ─── Test Connection ─────────────────────────────────

  $("testBtn").addEventListener("click", async () => {
    const result = $("testResult");
    result.textContent = "Testing...";
    result.className = "test-result";

    const provider = document.querySelector('input[name="provider"]:checked')?.value || "openai";
    const apiKey = $("apiKey").value.trim();
    const model = $("model").value.trim();
    const customUrl = $("customUrl").value.trim();

    if (!apiKey && provider !== "custom") {
      result.textContent = "Please enter an API Key";
      result.className = "test-result error";
      return;
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

      if (resp?.error) {
        result.textContent = "Failed: " + resp.error;
        result.className = "test-result error";
      } else if (resp?.translation) {
        result.textContent = "OK: " + resp.translation;
        result.className = "test-result success";
      } else {
        result.textContent = "Unexpected response";
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
    if (confirm("Clear all translation cache and SRS data?")) {
      await chrome.storage.local.remove(["srsData", "translationCache", "settings"]);
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

  $("clearDisabledBtn")?.addEventListener("click", async () => {
    const { settings } = await chrome.storage.local.get("settings");
    const s = settings || {};
    await chrome.storage.local.set({ settings: { ...s, disabledSites: [] } });
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

  // Only update if elements exist (they do on settings page)
  const $ = (id) => document.getElementById(id);
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
    container.innerHTML = '<p style="font-size: 13px; color: #9ca3af;">No disabled sites</p>';
  } else {
    container.innerHTML = disabledSites
      .map(site => `<span style="display:inline-block;background:#f3f4f6;padding:4px 8px;border-radius:4px;margin:4px;font-size:13px;">${site}</span>`)
      .join("");
  }
}

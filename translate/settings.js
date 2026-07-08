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
    onboardingCompleted: false,
    learnerLevel: null,
    estimatedVocabulary: null,
    levelSource: null
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
      disabledSites: s.disabledSites || [],
      onboardingCompleted: s.onboardingCompleted ?? false,
      learnerLevel: s.learnerLevel || null,
      estimatedVocabulary: s.estimatedVocabulary || null,
      levelSource: s.levelSource || null
    };
  }

  settings = migrateSettings(settings);

  // 确保新字段存在（老版 settings 可能缺少这些字段）
  if (settings.onboardingCompleted === undefined) settings.onboardingCompleted = false;
  if (settings.learnerLevel === undefined) settings.learnerLevel = null;
  if (settings.estimatedVocabulary === undefined) settings.estimatedVocabulary = null;
  if (settings.levelSource === undefined) settings.levelSource = null;

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
      disabledSites: latestDisabled,
      onboardingCompleted: settings.onboardingCompleted ?? false,
      learnerLevel: settings.learnerLevel || null,
      estimatedVocabulary: settings.estimatedVocabulary || null,
      levelSource: settings.levelSource || null
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
      await chrome.storage.local.remove(["srsData", "translationCache", "translensSLCache"]);
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

  // ─── My Level Section ───────────────────────────────────

  function updateLevelDisplay() {
    const badge = $("levelBadge");
    const label = $("levelLabel");
    const vocab = $("vocabEstimate");
    const banner = $("levelBanner");
    const manualSelect = $("manualLevel");
    const retakeBtn = $("retakeQuizBtn");
    const isEnglish = (settings.sourceLang || "zh-CN") === "en" || (settings.targetLang || "en") === "en";

    // 显示/隐藏 banner（旧用户未完成 onboarding）
    if (!settings.onboardingCompleted && stored && stored.settings) {
      // 有旧数据但未完成 onboarding → 显示提示
      banner?.classList.remove("hidden");
    } else {
      banner?.classList.add("hidden");
    }

    if (settings.learnerLevel) {
      const level = settings.learnerLevel;
      const levelNames = (typeof TRANSLENS_VOCAB !== 'undefined' && TRANSLENS_VOCAB.levelNames) || {
        A1: "Beginner", A2: "Elementary", B1: "Intermediate", B2: "Upper-Intermediate", C1: "Advanced"
      };

      badge.textContent = level;
      badge.className = "level-badge " + level;
      label.textContent = levelNames[level] || level;

      const vocabEst = settings.estimatedVocabulary;
      if (vocabEst) {
        vocab.textContent = `估算词汇量：~${vocabEst.toLocaleString()} 词`;
      } else {
        vocab.textContent = "";
      }

      manualSelect.value = level;
    } else {
      badge.textContent = "—";
      badge.className = "level-badge";
      label.textContent = "未设置";
      vocab.textContent = "完成水平评估后可查看估算词汇量";
      manualSelect.value = "";
    }

    // 英语显示重新测试按钮，非英语仅显示手动调整
    if (retakeBtn) {
      retakeBtn.style.display = isEnglish ? "" : "none";
    }
  }

  // 开始校准（banner 按钮）
  $("startCalibrationBtn")?.addEventListener("click", () => {
    showOnboarding();
  });

  // 重新测试
  $("retakeQuizBtn")?.addEventListener("click", () => {
    showOnboarding();
  });

  // 手动设置等级
  $("applyManualLevelBtn")?.addEventListener("click", async () => {
    const level = $("manualLevel").value;
    if (!level) return;

    const vocabEstimates = (typeof TRANSLENS_VOCAB !== 'undefined' && TRANSLENS_VOCAB.vocabEstimates) || {
      A1: 1000, A2: 2000, B1: 3500, B2: 5500, C1: 8000
    };

    settings.learnerLevel = level;
    settings.estimatedVocabulary = vocabEstimates[level] || null;
    settings.levelSource = "manual";
    settings.onboardingCompleted = true;

    await chrome.storage.local.set({ settings });
    updateLevelDisplay();

    $("applyManualLevelBtn").textContent = "已保存!";
    setTimeout(() => { $("applyManualLevelBtn").textContent = "应用"; }, 1500);
  });

  // ─── Onboarding ──────────────────────────────────────────

  let quiz = null;

  function showOnboarding() {
    const modal = $("onboardingModal");
    modal?.classList.remove("hidden");
    goToOnboardStep(1);
  }

  function hideOnboarding() {
    const modal = $("onboardingModal");
    modal?.classList.add("hidden");
  }

  function goToOnboardStep(step) {
    document.querySelectorAll(".onboard-step").forEach(el => el.classList.add("hidden"));

    const onboardLang = $("onboardSourceLang").value;

    if (step === 1) {
      $("onboardStep1")?.classList.remove("hidden");
      // 恢复当前 sourceLang 选择
      if (settings.sourceLang) {
        $("onboardSourceLang").value = settings.sourceLang;
      }
    } else if (step === 2) {
      if (onboardLang === "en" || settings.targetLang === "en") {
        // 学习内容或目标语言为英语 → 自适应测试
        $("onboardStep2Quiz")?.classList.remove("hidden");
        startQuiz();
      } else {
        // 非英语 → 手动选择
        $("onboardStep2Manual")?.classList.remove("hidden");
      }
    } else if (step === 3) {
      $("onboardStep3")?.classList.remove("hidden");
    }
  }

  function startQuiz() {
    if (typeof AdaptiveVocabQuiz === 'undefined') {
      alert("词汇测试模块未加载");
      return;
    }
    quiz = new AdaptiveVocabQuiz();
    quiz.start();
    renderQuizQuestion();
  }

  function renderQuizQuestion() {
    if (!quiz) return;

    const state = quiz.getState();

    if (state.finished) {
      showQuizResult();
      return;
    }

    const item = state.currentItem;
    const total = state.totalQuestions;
    const done = state.answeredCount;

    $("quizWord").textContent = item.word;
    $("quizRoundLabel").textContent = `Round ${state.currentRound} / 5`;
    $("quizProgressFill").style.width = `${(done / total) * 100}%`;

    // 假词不显示提示（避免暴露）
    $("quizHint").textContent = item.isPseudoword ? "" : "";
  }

  function showQuizResult() {
    const result = quiz.getResult();

    const levelNames = (typeof TRANSLENS_VOCAB !== 'undefined' && TRANSLENS_VOCAB.levelNames) || {
      A1: "Beginner", A2: "Elementary", B1: "Intermediate", B2: "Upper-Intermediate", C1: "Advanced"
    };

    $("resultBadge").textContent = result.level;
    $("resultBadge").className = "result-badge " + result.level;
    $("resultLevelName").textContent = levelNames[result.level] || result.level;
    $("resultVocab").textContent = `Estimated Vocabulary: ~${result.estimatedVocabulary.toLocaleString()} words`;

    const descriptions = {
      A1: "你能理解并使用日常基本用语，满足基本需求。TransLens 将为你推荐 A2 级别的词汇。",
      A2: "你能理解常用表达，进行简单的日常交流。TransLens 将为你推荐 B1 级别的词汇。",
      B1: "你能理解工作、学校中常见话题的要点。TransLens 将为你推荐 B2 级别的词汇。",
      B2: "你能理解复杂文章的主旨，能流利地与母语者交流。TransLens 将为你推荐 C1 级别的词汇。",
      C1: "你能理解广泛的高难度文本，能自如地表达自己。TransLens 将为你推荐高级学术/专业词汇。"
    };
    $("resultDesc").textContent = descriptions[result.level] || "";

    goToOnboardStep(3);
  }

  // Step 1 → Step 2
  $("onboardNext1Btn")?.addEventListener("click", () => {
    settings.sourceLang = $("onboardSourceLang").value;
    goToOnboardStep(2);
  });

  // Quiz buttons
  $("quizKnowBtn")?.addEventListener("click", () => {
    if (!quiz) return;
    quiz.answer(true);
    renderQuizQuestion();
  });

  $("quizDontKnowBtn")?.addEventListener("click", () => {
    if (!quiz) return;
    quiz.answer(false);
    renderQuizQuestion();
  });

  // 跳过测评 → 跳转到手动选择等级
  $("skipQuizBtn")?.addEventListener("click", () => {
    $("onboardStep2Quiz")?.classList.add("hidden");
    $("onboardStep2Manual")?.classList.remove("hidden");
  });

  // Manual level next
  $("onboardManualNextBtn")?.addEventListener("click", async () => {
    const selected = document.querySelector('input[name="manualOnboardLevel"]:checked');
    if (!selected) {
      alert("请选择你的等级");
      return;
    }

    const level = selected.value;
    const vocabEstimates = (typeof TRANSLENS_VOCAB !== 'undefined' && TRANSLENS_VOCAB.vocabEstimates) || {
      A1: 1000, A2: 2000, B1: 3500, B2: 5500, C1: 8000
    };
    const levelNames = (typeof TRANSLENS_VOCAB !== 'undefined' && TRANSLENS_VOCAB.levelNames) || {
      A1: "Beginner", A2: "Elementary", B1: "Intermediate", B2: "Upper-Intermediate", C1: "Advanced"
    };

    settings.learnerLevel = level;
    settings.estimatedVocabulary = vocabEstimates[level] || null;
    settings.levelSource = "manual";
    settings.onboardingCompleted = true;

    $("resultBadge").textContent = level;
    $("resultBadge").className = "result-badge " + level;
    $("resultLevelName").textContent = levelNames[level] || level;
    $("resultVocab").textContent = `Estimated Vocabulary: ~${(vocabEstimates[level] || 0).toLocaleString()} words`;
    $("resultDesc").textContent = '你可以随时在"我的水平"中调整等级。';

    goToOnboardStep(3);
  });

  // Finish onboarding
  $("onboardFinishBtn")?.addEventListener("click", async () => {
    // 如果是 quiz 完成，保存 quiz 结果
    if (quiz && quiz.getResult) {
      const result = quiz.getResult();
      settings.learnerLevel = result.level;
      settings.estimatedVocabulary = result.estimatedVocabulary;
      settings.levelSource = "quiz";
    }
    settings.onboardingCompleted = true;

    await chrome.storage.local.set({ settings });
    hideOnboarding();
    updateLevelDisplay();
  });

  // Check onboarding on load
  updateLevelDisplay();
  if (!settings.onboardingCompleted) {
    if (stored && stored.settings) {
      // 老用户（已有设置但未完成 onboarding）→ 只显示 banner，不强弹
      // banner 在 updateLevelDisplay 中已处理
    } else {
      // 全新用户 → 显示 onboarding modal
      showOnboarding();
    }
  }
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

// ─── Adaptive Vocabulary Quiz ───────────────────────────────
// Reference: OpenVLT (adaptive algorithm) + LexTALE (pseudoword correction)

class AdaptiveVocabQuiz {
  constructor() {
    this.levels = ["A1", "A2", "B1", "B2", "C1"];
    this.realCounts = [4, 4, 3, 3, 2];     // 每级真词数
    this.pseudoPerLevel = [1, 1, 1, 1, 1]; // 每级假词数
    this.questions = [];   // [{ level, items: [{ word, isReal, isPseudoword }] }]
    this.currentLevel = 0; // 当前测试到哪个 level index
    this.currentItem = 0;  // 当前 level 内第几题
    this.results = {};     // { A1: { realHits: 2, realTotal: 4 }, ... }
    this.pseudoHits = 0;
    this.pseudoTotal = 0;
    this.finished = false;
    this._finalResult = null;

    this._loadWords();
  }

  _loadWords() {
    // 从 TRANSLENS_VOCAB 加载词库；如果未加载则使用内置最小集
    const enData = (typeof TRANSLENS_VOCAB !== 'undefined' && TRANSLENS_VOCAB.en) || {};
    this.testWords = enData.testWords || {
      A1: ["hello","water","food","house","car","book","name","day","big","come","girl","hand","love","man","red","run","school","time","walk","year"],
      A2: ["kitchen","weather","yesterday","holiday","invite","decide","arrive","bottle","cheap","cloud","dance","during","enough","forest","garden","health"],
      B1: ["opinion","environment","experience","imagine","suggest","advantage","behavior","communicate","complain","conclusion","describe","disappoint"],
      B2: ["sophisticated","inevitable","controversy","substantial","accommodate","appreciate","circumstance","comprehensive","demonstrate","enthusiasm"],
      C1: ["ubiquitous","ephemeral","pragmatic","juxtapose","ambiguous","benevolent","clandestine","dichotomy","eloquent","fastidious"]
    };
    this.pseudowords = enData.pseudowords || ["blafe","tegral","crompt","sivver","mellant","drasque","floning","praste","virent","clemp"];
  }

  _sampleRandom(arr, count) {
    const copy = [...arr];
    const result = [];
    for (let i = 0; i < count && copy.length > 0; i++) {
      const idx = Math.floor(Math.random() * copy.length);
      result.push(copy.splice(idx, 1)[0]);
    }
    return result;
  }

  _shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  start() {
    this.questions = [];
    this.currentLevel = 0;
    this.currentItem = 0;
    this.results = {};
    this.pseudoHits = 0;
    this.pseudoTotal = 0;
    this.finished = false;
    this._finalResult = null;

    for (let i = 0; i < this.levels.length; i++) {
      const level = this.levels[i];
      const realWords = this._sampleRandom(this.testWords[level] || [], this.realCounts[i]);
      const pseudoWords = this._sampleRandom(this.pseudowords, this.pseudoPerLevel[i]);

      const items = this._shuffle([
        ...realWords.map(w => ({ word: w, isReal: true, isPseudoword: false })),
        ...pseudoWords.map(w => ({ word: w, isReal: false, isPseudoword: true }))
      ]);

      this.questions.push({ level, items });
      this.results[level] = { realHits: 0, realTotal: realWords.length };
    }
  }

  answer(isKnown) {
    if (this.finished) return;

    const round = this.questions[this.currentLevel];
    if (!round) { this.finished = true; return; }

    const item = round.items[this.currentItem];
    if (!item) { this._advanceLevel(); return; }

    if (item.isPseudoword) {
      this.pseudoTotal++;
      if (isKnown) this.pseudoHits++;
    } else {
      if (isKnown) this.results[round.level].realHits++;
    }

    this.currentItem++;

    // 当前轮次完成
    if (this.currentItem >= round.items.length) {
      this._advanceLevel();
    }
  }

  _advanceLevel() {
    const level = this.levels[this.currentLevel];
    const r = this.results[level];
    const accuracy = r.realTotal > 0 ? r.realHits / r.realTotal : 0;

    if (accuracy >= 0.8) {
      // 升级
      if (this.currentLevel + 1 < this.levels.length) {
        this.currentLevel++;
        this.currentItem = 0;
      } else {
        this.finished = true;
      }
    } else if (accuracy >= 0.5) {
      // 停止，当前级别即为结果
      this.finished = true;
    } else {
      // 降级 (< 50%)
      if (this.currentLevel > 0) {
        this.currentLevel--;
        this.finished = true;
      } else {
        this.finished = true;
      }
    }
  }

  getState() {
    const totalQuestions = this.questions.reduce((sum, r) => sum + r.items.length, 0);
    let answeredCount = 0;
    for (let i = 0; i < this.currentLevel; i++) {
      answeredCount += this.questions[i].items.length;
    }
    answeredCount += this.currentItem;

    const currentRound = this.questions[this.currentLevel];
    const currentItem = currentRound ? currentRound.items[this.currentItem] : null;

    return {
      finished: this.finished,
      currentRound: this.currentLevel + 1,
      totalRounds: this.levels.length,
      currentItem: currentItem || { word: "", isReal: false, isPseudoword: false },
      totalQuestions,
      answeredCount
    };
  }

  getResult() {
    if (this._finalResult) return this._finalResult;

    // 找到最终测试到的最高级别
    // 如果 finished 是因为降级，结果 = currentLevel - 1 的级别
    // 如果 finished 是因为 accuracy >= 80% 升级但已到顶，结果 = 最后级别
    // 如果 finished 是因为 accuracy 50-80%，结果 = 当前级别
    let finalLevelIndex = this.currentLevel;

    // 如果最后一轮 accuracy < 50% 且不是第一轮，则降级
    const lastTestedLevel = this.levels[finalLevelIndex];
    const lastResult = this.results[lastTestedLevel];
    if (lastResult && lastResult.realTotal > 0) {
      const lastAcc = lastResult.realHits / lastResult.realTotal;
      if (lastAcc < 0.5 && finalLevelIndex > 0) {
        finalLevelIndex--;
      }
    }

    const finalLevel = this.levels[finalLevelIndex];

    // 词汇量估算 (LexTALE-style 假词校正)
    const falseAlarmRate = this.pseudoTotal > 0 ? this.pseudoHits / this.pseudoTotal : 0;
    const bandSizes = (typeof TRANSLENS_VOCAB !== 'undefined' && TRANSLENS_VOCAB.bandSizes) || {
      A1: 1000, A2: 1000, B1: 1500, B2: 2000, C1: 2500
    };

    let totalVocab = 0;
    // 对每个已测试的级别计算校正后的掌握比例
    for (let i = 0; i <= finalLevelIndex; i++) {
      const lvl = this.levels[i];
      const r = this.results[lvl];
      if (!r || r.realTotal === 0) continue;

      const hitRate = r.realHits / r.realTotal;
      const correctedRate = Math.max(0, hitRate - falseAlarmRate);
      totalVocab += correctedRate * (bandSizes[lvl] || 1000);
    }

    // 对于高于 finalLevel 但低于 C1 的级别，如果用户在该级别没有测试到，
    // 不计入（因为已经跳过了）

    this._finalResult = {
      level: finalLevel,
      estimatedVocabulary: Math.round(totalVocab)
    };

    return this._finalResult;
  }
}


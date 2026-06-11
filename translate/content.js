// TransLens Content Script — Language Learning on Web Pages
// 在浏览网页时自动标注生词，基于 SRS 间隔重复算法

(function () {
  "use strict";

  // ─── Config ────────────────────────────────────────────

  const MARKER = "data-translens-processed"; // 已处理标记
  let config = {}; // 从 chrome.storage.local 加载
  let srsData = {}; // SRS 词库
  let stats = { newToday: 0, today: getToday() }; // 今日统计

  function getToday() {
    return new Date().toDateString();
  }

  async function loadConfig() {
    const { settings } = await chrome.storage.local.get("settings");
    config = settings || {};
    return config;
  }

  async function loadSRS() {
    const { srsData: data } = await chrome.storage.local.get("srsData");
    srsData = data || {};
    return srsData;
  }

  async function saveSRS() {
    await chrome.storage.local.set({ srsData });
  }

  // ─── Language Detection ────────────────────────────────
  // 存储 source pattern 字符串，getLangPattern 每次创建新 RegExp 实例

  const LANG_PATTERNS = {
    "zh-CN": { name: "Chinese Simplified", source: "[\\u4e00-\\u9fff]{1,6}" },
    "zh-TW": { name: "Chinese Traditional", source: "[\\u4e00-\\u9fff\\u3400-\\u4dbf]{1,6}" },
    ja: { name: "Japanese", source: "[\\u3040-\\u309f\\u30a0-\\u30ff\\u4e00-\\u9fff\\u3400-\\u4dbf]{1,6}" },
    ko: { name: "Korean", source: "[\\uac00-\\ud7af\\u1100-\\u11ff]{1,5}" },
    fr: { name: "French", source: "[a-zA-Z\\u00c0-\\u024f]{2,}" },
    de: { name: "German", source: "[a-zA-Z\\u00c0-\\u024f\\u00df\\u00e4\\u00f6\\u00fc\\u00c4\\u00d6\\u00dc]{2,}" },
    es: { name: "Spanish", source: "[a-zA-Z\\u00c0-\\u024f\\u00f1\\u00d1]{2,}" },
    ru: { name: "Russian", source: "[\\u0400-\\u04ff]{2,}" },
    ar: { name: "Arabic", source: "[\\u0600-\\u06ff]{2,}" },
  };

  function getLangPattern() {
    const lang = config.sourceLang || "zh-CN";
    if (lang === "custom") {
      return new RegExp(config.customRegex || "[\\u4e00-\\u9fff]{1,6}", "g");
    }
    const entry = LANG_PATTERNS[lang] || LANG_PATTERNS["zh-CN"];
    return new RegExp(entry.source, "g");
  }

  function getLangName() {
    const lang = config.sourceLang || "zh-CN";
    if (lang === "custom") return "Custom";
    return LANG_PATTERNS[lang]?.name || "Chinese Simplified";
  }

  // ─── DOM Text Extraction ──────────────────────────────

  function extractChineseTexts() {
    const minLen = config.minWordLen || 2;
    const results = [];

    const walker = document.createTreeWalker(
      document.body || document,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const text = node.textContent.trim();
          if (text.length < 2) return NodeFilter.FILTER_REJECT;

          // 跳过已处理节点
          if (node.parentElement?.getAttribute(MARKER)) {
            return NodeFilter.FILTER_REJECT;
          }

          // 跳过 script/style 等
          const parent = node.parentElement?.tagName.toLowerCase();
          if (parent === "script" || parent === "style" || parent === "noscript") {
            return NodeFilter.FILTER_REJECT;
          }

          // 检查是否包含目标语言字符
          const checkPattern = getLangPattern();
          if (checkPattern.test(text)) {
            return NodeFilter.FILTER_ACCEPT;
          }
          return NodeFilter.FILTER_REJECT;
        },
      }
    );

    let textNode;
    while ((textNode = walker.nextNode())) {
      const text = textNode.textContent.trim();
      if (text.length < 2) continue;

      // 每次新建正则实例，避免 lastIndex 状态问题
      const matchPattern = getLangPattern();
      const matches = text.match(matchPattern) || [];
      const validWords = matches.filter((w) => w.length >= minLen);

      if (validWords.length > 0) {
        results.push({
          node: textNode,
          text,
          words: validWords,
          parent: textNode.parentElement,
        });
      }
    }

    return results;
  }

  // ─── SRS Engine ────────────────────────────────────────

  function getWordState(word) {
    return srsData[word] || null;
  }

  function createWordEntry(word) {
    const now = Date.now();
    const entry = {
      word,
      language: config.sourceLang || "zh-CN",
      easiness: 2.5,
      interval: 0,
      repetitions: 0,
      nextReview: now, // 新词立即需要学习
      lastSeen: now,
      translation: "",
      contextCount: 1,
      createdAt: now,
      reviewCount: 0,
    };
    srsData[word] = entry;
    return entry;
  }

  function shouldReview(word) {
    const entry = getWordState(word);
    if (!entry) return "new"; // 新词
    if (entry.reviewCount >= (config.masteryThreshold || 6)) return "mastered"; // 已掌握
    if (Date.now() >= entry.nextReview) return "due"; // 到期
    return "not-due"; // 未到复习时间
  }

  function updateSRS(word, rating) {
    // rating: 0=不认识, 1=有点印象, 2=认识
    let entry = getWordState(word);
    if (!entry) {
      entry = createWordEntry(word);
    }

    entry.lastSeen = Date.now();
    entry.reviewCount++;

    if (rating === 0) {
      // 不认识 → 重置
      entry.interval = 0;
      entry.repetitions = 0;
      entry.nextReview = Date.now() + 60000; // 1分钟后复习
    } else if (rating === 1) {
      // 有点印象 → 小间隔
      entry.interval = Math.max(1, entry.interval);
      entry.repetitions = 0;
      entry.nextReview = Date.now() + entry.interval * 86400000;
    } else {
      // 认识 → 增大间隔
      entry.easiness = Math.max(1.3, entry.easiness + 0.1);
      entry.repetitions++;
      const multiplier = config.intervalMultiplier || 2.5;
      entry.interval =
        entry.interval === 0 ? 1 : Math.round(entry.interval * multiplier);
      entry.nextReview = Date.now() + entry.interval * 86400000;
    }

    saveSRS();
    return entry;
  }

  // ─── Word Selection ────────────────────────────────────

  function selectWordsForTranslation(textItems) {
    const ratio = (config.selectRatio || 40) / 100;
    const maxNew = config.maxNewWords || 50;
    const candidates = [];

    for (const item of textItems) {
      for (const word of item.words) {
        const state = shouldReview(word);
        if (state === "mastered" || state === "not-due") continue;
        if (state === "new" && stats.newToday >= maxNew) continue;

        candidates.push({ item, word, state });
      }
    }

    // 优先复习到期的词，然后是新词
    candidates.sort((a, b) => {
      if (a.state === "due" && b.state !== "due") return -1;
      if (a.state !== "due" && b.state === "due") return 1;
      return Math.random() - 0.5; // 同优先级随机
    });

    // 按选择比例选取
    const count = Math.max(1, Math.floor(candidates.length * ratio));
    return candidates.slice(0, count);
  }

  // ─── Translation API ───────────────────────────────────

  async function translateWord(sentence, targetWord) {
    const sourceLang = getLangName();
    const targetLangName =
      LANG_PATTERNS[config.targetLang || "en"]?.name || "English";

    try {
      const result = await chrome.runtime.sendMessage({
        type: "TRANSLATE",
        payload: {
          sentence,
          targetWord,
          sourceLang,
          targetLang: targetLangName,
          settings: {
            provider: config.provider,
            apiKey: config.apiKey,
            model: config.model,
            customUrl: config.customUrl,
          },
        },
      });

      if (result?.error) {
        console.error("[TransLens] Translation error:", result.error);
        return null;
      }

      return result?.translation || null;
    } catch (err) {
      console.error("[TransLens] API call failed:", err);
      return null;
    }
  }

  // ─── DOM Annotation ────────────────────────────────────

  function annotateWordInText(textData, targetWord, translation) {
    const originalText = textData.text;
    if (!originalText.includes(targetWord)) return false;

    // 创建带样式的标注
    const annotation = `<span style="color:#ff6b35;font-weight:600;background:#fff3cd;padding:1px 4px;border-radius:3px;font-size:0.85em;margin-left:2px;cursor:pointer;border-bottom:1px dashed #ff6b35;" title="${translation}">【${translation}】</span>`;

    const currentHTML = textData.parent.innerHTML;

    // 只替换第一次出现的 targetWord
    const escaped = targetWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const newHTML = currentHTML.replace(
      new RegExp(escaped, "g"),
      (match) => `${match}${annotation}`
    );

    try {
      textData.parent.innerHTML = newHTML;
      textData.parent.setAttribute(MARKER, "true");
      return true;
    } catch (err) {
      console.error("[TransLens] DOM annotation failed:", err);
      return false;
    }
  }

  // ─── Main Execution ────────────────────────────────────

  async function execute() {
    await loadConfig();
    await loadSRS();

    // 检查当前网站是否在禁用列表中
    const currentHost = window.location.hostname;
    const disabledSites = config.disabledSites || [];
    if (disabledSites.includes(currentHost)) {
      console.log(`[TransLens] 当前网站 ${currentHost} 已被禁用，跳过翻译`);
      return;
    }

    if (!config.apiKey) {
      console.log("[TransLens] No API Key configured, skipping.");
      return;
    }

    console.log("[TransLens] Starting language learning scan...");
    console.log(
      `[TransLens] Config: ${config.sourceLang} → ${config.targetLang}, mode: ${config.mode || "vocabulary"}`
    );

    // 提取中文文本
    const textItems = extractChineseTexts();
    console.log(`[TransLens] Found ${textItems.length} text nodes with target language content`);

    if (textItems.length === 0) return;

    // 选择需要翻译的词
    const selections = selectWordsForTranslation(textItems);
    console.log(`[TransLens] Selected ${selections.length} words for translation`);

    if (selections.length === 0) return;

    // 去重（同一个词不重复翻译）
    const seen = new Set();
    const unique = selections.filter((s) => {
      if (seen.has(s.word)) return false;
      seen.add(s.word);
      return true;
    });

    // 逐词翻译并标注
    let annotated = 0;
    for (const { item, word, state } of unique) {
      if (state === "new") stats.newToday++;

      const translation = await translateWord(item.text, word);
      if (translation) {
        // 更新 SRS 翻译缓存
        let entry = getWordState(word);
        if (!entry) entry = createWordEntry(word);
        entry.translation = translation;
        entry.contextCount = (entry.contextCount || 0) + 1;
        saveSRS();

        const success = annotateWordInText(item, word, translation);
        if (success) annotated++;
      }

      // 限速：500ms 间隔
      await sleep(500);
    }

    console.log(`[TransLens] Done. Annotated ${annotated} words.`);
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ─── Page Load Trigger ────────────────────────────────

  function waitForPageLoad() {
    if (document.readyState === "complete") {
      setTimeout(execute, 500);
    } else if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => setTimeout(execute, 500));
    }
    window.addEventListener("load", () => setTimeout(execute, 300));
    // Fallback
    setTimeout(execute, 3000);
  }

  waitForPageLoad();
})();

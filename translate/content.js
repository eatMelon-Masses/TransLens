// TransLens Content Script — Language Learning on Web Pages
// 在浏览网页时自动标注生词，基于 SRS 间隔重复算法

(function () {
  "use strict";

  // ─── Config ────────────────────────────────────────────

  const MARKER = "data-translens-processed"; // 已处理标记
  let config = {}; // 从 chrome.storage.local 加载
  let srsData = {}; // SRS 词库
  let stats = { newToday: 0, today: getToday() }; // 今日统计
  let executeRunning = false;
  let executeTimer = null;

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
    "zh-CN": { name: "Chinese Simplified", charClass: "[\\u4e00-\\u9fff]", defaultMaxLen: 6 },
    "zh-TW": { name: "Chinese Traditional", charClass: "[\\u4e00-\\u9fff\\u3400-\\u4dbf]", defaultMaxLen: 6 },
    ja: { name: "Japanese", charClass: "[\\u3040-\\u309f\\u30a0-\\u30ff\\u4e00-\\u9fff\\u3400-\\u4dbf]", defaultMaxLen: 6 },
    ko: { name: "Korean", charClass: "[\\uac00-\\ud7af\\u1100-\\u11ff]", defaultMaxLen: 5 },
    fr: { name: "French", source: "[a-zA-Z\\u00c0-\\u024f]{2,}" },
    de: { name: "German", source: "[a-zA-Z\\u00c0-\\u024f\\u00df\\u00e4\\u00f6\\u00fc\\u00c4\\u00d6\\u00dc]{2,}" },
    es: { name: "Spanish", source: "[a-zA-Z\\u00c0-\\u024f\\u00f1\\u00d1]{2,}" },
    ru: { name: "Russian", source: "[\\u0400-\\u04ff]{2,}" },
    ar: { name: "Arabic", source: "[\\u0600-\\u06ff]{2,}" },
  };

  const SEGMENTER_LOCALES = {
    "zh-CN": "zh-CN",
    "zh-TW": "zh-TW",
    ja: "ja",
    ko: "ko",
  };

  function getMaxPhraseLen(entry) {
    const minLen = Number(config.minWordLen || 1);
    const defaultMax = entry?.defaultMaxLen || 6;
    return Math.max(minLen, clamp(Number(config.maxPhraseLen || defaultMax), 1, 20));
  }

  function getLangPattern() {
    const lang = config.sourceLang || "zh-CN";
    if (lang === "custom") {
      return new RegExp(config.customRegex || "[\\u4e00-\\u9fff]{1,6}", "g");
    }
    const entry = LANG_PATTERNS[lang] || LANG_PATTERNS["zh-CN"];
    if (entry.charClass) {
      return new RegExp(`${entry.charClass}{1,${getMaxPhraseLen(entry)}}`, "g");
    }
    return new RegExp(entry.source, "g");
  }

  function getLanguageEntry() {
    const lang = config.sourceLang || "zh-CN";
    return LANG_PATTERNS[lang] || LANG_PATTERNS["zh-CN"];
  }

  function getLanguageCharPattern() {
    const entry = getLanguageEntry();
    return entry.charClass ? new RegExp(`${entry.charClass}+`, "g") : getLangPattern();
  }

  function getWordCandidates(text) {
    const lang = config.sourceLang || "zh-CN";
    const entry = getLanguageEntry();
    const minLen = Number(config.minWordLen || 2);
    const maxLen = getMaxPhraseLen(entry);

    if (lang !== "custom" && entry.charClass && window.Intl?.Segmenter && SEGMENTER_LOCALES[lang]) {
      const segmenter = new Intl.Segmenter(SEGMENTER_LOCALES[lang], { granularity: "word" });
      const runs = text.match(getLanguageCharPattern()) || [];
      const words = [];

      for (const run of runs) {
        for (const part of segmenter.segment(run)) {
          const word = part.segment.trim();
          if (!part.isWordLike) continue;
          if (word.length < minLen || word.length > maxLen) continue;
          words.push(word);
        }
      }

      return words;
    }

    const matches = text.match(getLangPattern()) || [];
    return matches.filter((word) => word.length >= minLen && word.length <= maxLen);
  }

  function getTranslationContext(text, targetWord) {
    const lang = config.sourceLang || "zh-CN";
    const entry = getLanguageEntry();
    if (lang === "custom" || !entry.charClass) return text;

    const pattern = getLanguageCharPattern();
    for (const match of text.matchAll(pattern)) {
      const run = match[0];
      if (run.includes(targetWord)) return run;
    }

    return text;
  }

  function getLangName() {
    const lang = config.sourceLang || "zh-CN";
    if (lang === "custom") return "Custom";
    return LANG_PATTERNS[lang]?.name || "Chinese Simplified";
  }

  // ─── DOM Text Extraction ──────────────────────────────

  function extractChineseTexts() {
    const results = [];

    const walker = document.createTreeWalker(
      document.body || document,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const text = node.textContent.trim();
          if (text.length < 2) return NodeFilter.FILTER_REJECT;

          // 跳过已处理节点及 TransLens 自己插入的标注内容。
          if (node.parentElement?.closest(`[${MARKER}], .translens-annotation`)) {
            return NodeFilter.FILTER_REJECT;
          }

          // 跳过 script/style 等
          const parent = node.parentElement?.tagName.toLowerCase();
          // 跳过表单元素（搜索框、文本框等），避免干扰用户输入
          if (["input", "textarea", "select", "button"].includes(parent)) {
            return NodeFilter.FILTER_REJECT;
          }
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

      const validWords = getWordCandidates(text);

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

  function isUsableTranslation(value) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    if (!text) return false;
    if (text.length > 80) return false;
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

  function getCachedTranslation(word) {
    const entry = getWordState(word);
    if (entry?.language && entry.language !== (config.sourceLang || "zh-CN")) return null;
    if (entry?.targetLang && entry.targetLang !== (config.targetLang || "en")) return null;
    if (!isUsableTranslation(entry?.translation)) return null;
    return {
      translation: String(entry.translation).replace(/\s+/g, " ").trim(),
      phonetic: entry.phonetic || "",
    };
  }

  function createWordEntry(word) {
    const now = Date.now();
    const entry = {
      word,
      language: config.sourceLang || "zh-CN",
      targetLang: config.targetLang || "en",
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
    const maxPerPage = clamp(Number(config.maxTranslationsPerPage || 30), 1, 100);
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
    const count = Math.min(maxPerPage, Math.max(1, Math.floor(candidates.length * ratio)));
    return candidates.slice(0, count);
  }

  // ─── Translation API ───────────────────────────────────

  async function translateWord(sentence, targetWord) {
    const sourceLang = getLangName();
    const targetLangName =
      LANG_PATTERNS[config.targetLang || "en"]?.name || "English";
    const context = getTranslationContext(sentence, targetWord);

    // 从 per-provider 配置中读取当前 provider 的 API 信息
    const provider = config.provider || "openai";
    const providerConfig = config.providers?.[provider] || {};
    const { apiKey = "", model = "", customUrl = "" } = providerConfig;

    try {
      const result = await chrome.runtime.sendMessage({
        type: "TRANSLATE",
        payload: {
          sentence: context,
          targetWord,
          sourceLang,
          targetLang: targetLangName,
          settings: { provider, apiKey, model, customUrl },
        },
      });

      if (result?.error) {
        console.error("[TransLens] Translation error:", result.error);
        return null;
      }

      return {
        translation: result?.translation || null,
        phonetic: result?.phonetic || ""
      };
    } catch (err) {
      console.error("[TransLens] API call failed:", err);
      return null;
    }
  }

  // ─── DOM Annotation ────────────────────────────────────

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function getTranslationConcurrency() {
    return clamp(Number(config.translationConcurrency || 3), 1, 5);
  }

  function getAnnotationScale() {
    return clamp(Number(config.annotationScale || 110), 90, 130) / 100;
  }

  function escapeHTML(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function annotateWordInText(textData, targetWord, translation, phonetic = "") {
    const originalText = textData.text;
    if (!originalText.includes(targetWord)) return false;
    if (textData.parent.closest(`[${MARKER}], .translens-annotation`)) return false;

    const scale = getAnnotationScale();
    const translationFontSize = `${(0.86 * scale).toFixed(2)}em`;
    const phoneticFontSize = `${(0.82 * scale).toFixed(2)}em`;
    const safeWord = escapeHTML(targetWord);
    const safeTranslation = escapeHTML(translation);
    const safePhonetic = escapeHTML(phonetic);

    // 创建精美的标注样式（参考 Apple 词典 + 微信读书）
    // 底部虚线 + 行内翻译，Hover 显示音标 tooltip
    const annotationHTML = `<span class="translens-annotation"
      ${MARKER}="true"
      style="
        border-bottom: 2px dotted #4A90D9;
        border-bottom-color: rgba(74,144,217,0.6);
        padding-bottom: 1px;
        margin-bottom: -1px;
        cursor: help;
        position: relative;
        display: inline-block;
        line-height: 1.35;
      "
      data-translation="${safeTranslation}"
      data-phonetic="${safePhonetic}">
      ${safeWord}
      <span class="translens-translation"
        style="
          display: inline-block;
          font-size: ${translationFontSize};
          line-height: 1.25;
          color: #4B5563;
          color: rgba(75,85,99,0.96);
          margin-left: 3px;
          padding: 1px 5px;
          background: rgba(243,244,246,0.96);
          border-radius: 5px;
          font-weight: 600;
          white-space: nowrap;
          vertical-align: baseline;
        ">${safeTranslation}</span>
      ${phonetic ? `<span class="translens-phonetic-popup"
        style="
          display: none;
          position: absolute;
          bottom: calc(100% + 5px);
          left: 50%;
          transform: translateX(-50%);
          background: #1F2937;
          color: #F9FAFB;
          padding: 5px 9px;
          border-radius: 6px;
          font-size: ${phoneticFontSize};
          line-height: 1.25;
          white-space: normal;
          max-width: min(280px, calc(100vw - 24px));
          z-index: 10000;
          box-shadow: 0 2px 8px rgba(0,0,0,0.15);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Arial Unicode MS', 'Lucida Sans Unicode', sans-serif;
          text-align: center;
        ">${safePhonetic}</span>` : ''}
    </span>`;

    const currentHTML = textData.parent.innerHTML;

    // 检查是否已经处理过（避免重复标注）
    if (currentHTML.includes('class="translens-annotation"')) {
      return false;
    }

    // 替换原文本节点中的目标词
    const escaped = targetWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, 'g');

    // 只替换第一个匹配项
    let replaced = false;
    const newHTML = currentHTML.replace(regex, (match) => {
      if (replaced) return match;
      replaced = true;
      return annotationHTML;
    });

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

  async function runWithConcurrency(items, limit, worker) {
    let index = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (index < items.length) {
        const item = items[index++];
        await worker(item);
      }
    });

    await Promise.all(workers);
  }

  // ─── Disabled Sites Matching ───────────────────────────

  // 支持精确匹配和通配符（*.example.com）
  function isHostDisabled(hostname, disabledSites) {
    return disabledSites.some(site => {
      if (site.startsWith("*.")) {
        const suffix = site.slice(2); // "example.com"
        return hostname === suffix || hostname.endsWith("." + suffix);
      }
      return hostname === site;
    });
  }

  async function execute() {
    if (executeRunning) return;
    executeRunning = true;

    try {
      await loadConfig();
      await loadSRS();

      // 检查当前网站是否在禁用列表中
      const currentHost = window.location.hostname;
      const disabledSites = config.disabledSites || [];
      if (isHostDisabled(currentHost, disabledSites)) {
        console.log(`[TransLens] 当前网站 ${currentHost} 已被禁用，跳过翻译`);
        return;
      }

      const provider = config.provider || "openai";
      const providerConfig = config.providers?.[provider] || {};
      const apiKey = providerConfig.apiKey || "";

      if (provider !== "custom" && !apiKey) {
        console.log("[TransLens] No API Key configured for " + provider + ", skipping.");
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

      // 已缓存的词立即标注，缺失的词再走 API。
      let annotated = 0;
      let srsDirty = false;
      const pendingTranslations = [];

      for (const { item, word, state } of unique) {
        if (state === "new") stats.newToday++;

        const cached = getCachedTranslation(word);
        if (cached) {
          const entry = getWordState(word);
          entry.lastSeen = Date.now();
          entry.contextCount = (entry.contextCount || 0) + 1;
          srsDirty = true;

          const success = annotateWordInText(item, word, cached.translation, cached.phonetic);
          if (success) annotated++;
          continue;
        }

        pendingTranslations.push({ item, word });
      }

      if (pendingTranslations.length > 0) {
        const concurrency = getTranslationConcurrency();
        console.log(`[TransLens] Translating ${pendingTranslations.length} uncached words with concurrency ${concurrency}`);

        await runWithConcurrency(pendingTranslations, concurrency, async ({ item, word }) => {
          const result = await translateWord(item.text, word);

          if (result && isUsableTranslation(result.translation)) {
            // 更新 SRS 翻译缓存
            let entry = getWordState(word);
            if (!entry) entry = createWordEntry(word);
            entry.language = config.sourceLang || "zh-CN";
            entry.targetLang = config.targetLang || "en";
            entry.translation = String(result.translation).replace(/\s+/g, " ").trim();
            entry.phonetic = result.phonetic || "";
            entry.contextCount = (entry.contextCount || 0) + 1;
            entry.lastSeen = Date.now();
            srsDirty = true;

            const success = annotateWordInText(item, word, entry.translation, result.phonetic);
            if (success) annotated++;
          }
        });
      }

      if (srsDirty) {
        await saveSRS();
      }

      console.log(`[TransLens] Done. Annotated ${annotated} words.`);
    } finally {
      executeRunning = false;
    }
  }

  // ─── Page Load Trigger ────────────────────────────────

  function scheduleExecute(delay) {
    if (executeRunning || executeTimer) return;
    executeTimer = setTimeout(() => {
      executeTimer = null;
      execute().catch((err) => console.error("[TransLens] Scan failed:", err));
    }, delay);
  }

  function waitForPageLoad() {
    if (document.readyState === "complete" || document.readyState === "interactive") {
      scheduleExecute(150);
    } else {
      document.addEventListener("DOMContentLoaded", () => scheduleExecute(150), { once: true });
    }
    window.addEventListener("load", () => scheduleExecute(100), { once: true });
    // Fallback
    setTimeout(() => scheduleExecute(0), 2500);

    // 添加 hover 事件监听，显示音标
    document.addEventListener("mouseover", (e) => {
      const annotation = e.target.closest(".translens-annotation");
      if (annotation) {
        const phoneticPopup = annotation.querySelector(".translens-phonetic-popup");
        if (phoneticPopup) {
          phoneticPopup.style.display = "block";
        }
      }
    });

    document.addEventListener("mouseout", (e) => {
      const annotation = e.target.closest(".translens-annotation");
      if (annotation) {
        const phoneticPopup = annotation.querySelector(".translens-phonetic-popup");
        if (phoneticPopup) {
          phoneticPopup.style.display = "none";
        }
      }
    });
  }

  waitForPageLoad();
})();

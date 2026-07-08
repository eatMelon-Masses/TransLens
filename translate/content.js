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
    "en": { name: "English", source: "[a-zA-Z]{2,}" },
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
    // 直接返回原文，不做截取。
    // 原文给 AI 完整的句子上下文用于词义消歧，同时 prompt 已强制要求只翻译 targetWord。
    // 之前截取 CJK 连续段（如 "分区调整和"）反而会把相邻词带入翻译结果。
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

  function levelToNum(level) {
    return { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5 }[level] || 0;
  }

  // Map sourceLang to TRANSLENS_VOCAB key
  // "en" → "en", "zh-CN"/"zh-TW" → "zh", others → null (no vocab data)
  function getVocabLang(sourceLang) {
    const map = { "en": "en", "zh-CN": "zh", "zh-TW": "zh" };
    return map[sourceLang] || null;
  }

  // Cache: word → CEFR level Map, built lazily per language
  const _wordLevelCache = {};

  function getWordLevel(word) {
    const vocabLang = getVocabLang(config.sourceLang);
    if (!vocabLang || typeof TRANSLENS_VOCAB === "undefined") return null;

    const langData = TRANSLENS_VOCAB[vocabLang];
    if (!langData || !langData.levelWords) return null;

    // Build cache on first access (O(n) once, then O(1) per lookup)
    if (!_wordLevelCache[vocabLang]) {
      const m = new Map();
      for (const level of ["A1", "A2", "B1", "B2", "C1"]) {
        const words = langData.levelWords[level];
        if (words) {
          for (const w of words) m.set(w, level);
        }
      }
      _wordLevelCache[vocabLang] = m;
    }

    // English: case-insensitive; Chinese: exact match
    const lookupWord = vocabLang === "en" ? word.toLowerCase() : word;
    return _wordLevelCache[vocabLang].get(lookupWord) || null;
  }

  function selectWordsForTranslation(textItems) {
    const ratio = (config.selectRatio || 40) / 100;
    const maxNew = config.maxNewWords || 50;
    const maxPerPage = clamp(Number(config.maxTranslationsPerPage || 30), 1, 100);
    const learnerLevel = config.learnerLevel;
    const learnerNum = levelToNum(learnerLevel);
    const candidates = [];

    for (const item of textItems) {
      for (const word of item.words) {
        const state = shouldReview(word);
        if (state === "mastered" || state === "not-due") continue;
        if (state === "new" && stats.newToday >= maxNew) continue;

        // 水平过滤：仅对新词生效，到期复习词不受影响
        if (learnerLevel && state === "new") {
          const wordLevel = getWordLevel(word);
          if (wordLevel) {
            const diff = levelToNum(wordLevel) - learnerNum;
            if (diff <= 0) continue; // 低于等于用户水平 → 跳过
          }
          // 未知词（wordLevel === null）→ 不跳过，按中高难度处理
        }

        candidates.push({ item, word, state });
      }
    }

    // 优先级排序
    candidates.sort((a, b) => {
      // 1. 到期复习的词最优先
      if (a.state === "due" && b.state !== "due") return -1;
      if (a.state !== "due" && b.state === "due") return 1;
      // 2. 高于用户水平 1 档的词优先（最近发展区 i+1）
      if (learnerLevel) {
        const diffA = levelToNum(getWordLevel(a.word)) - learnerNum;
        const diffB = levelToNum(getWordLevel(b.word)) - learnerNum;
        const preferA = diffA === 1 ? 1 : 0;
        const preferB = diffB === 1 ? 1 : 0;
        if (preferA !== preferB) return preferB - preferA;
      }
      // 3. 同优先级随机
      return Math.random() - 0.5;
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

    // 查找该词的 CEFR 等级
    const wordLevel = getWordLevel(targetWord);
    const levelColors = { A1: "#22C55E", A2: "#84CC16", B1: "#EAB308", B2: "#F97316", C1: "#EF4444" };
    const levelColor = levelColors[wordLevel] || "#6B7280";
    const levelBadge = wordLevel
      ? `<span style="display:inline-block;background:${levelColor};color:#fff;font-size:0.78em;font-weight:700;padding:1px 5px;border-radius:3px;margin-right:5px;letter-spacing:0.5px;">${wordLevel}</span>`
      : "";

    // 创建精美的标注样式（参考 Apple 词典 + 微信读书）
    // 底部虚线 + 行内翻译，Hover 显示等级 + 音标 tooltip + 已掌握按钮
    const annotationHTML = `<span class="translens-annotation"
      ${MARKER}="true"
      data-word="${safeWord}"
      style="
        border-bottom: 2px dotted #4A90D9;
        border-bottom-color: rgba(74,144,217,0.6);
        padding-bottom: 1px;
        padding-top: 8px;
        cursor: help;
        position: relative;
        display: inline-block;
        line-height: 1.35;
      "
      data-translation="${safeTranslation}"
      data-phonetic="${safePhonetic}"
      data-level="${wordLevel || ""}">
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
      <span class="translens-phonetic-popup"
        style="
          display: none;
          position: absolute;
          bottom: 100%;
          left: 50%;
          transform: translateX(-50%);
          background: #1F2937;
          color: #F9FAFB;
          padding: 6px 10px;
          border-radius: 6px;
          font-size: ${phoneticFontSize};
          line-height: 1.4;
          white-space: normal;
          max-width: min(300px, calc(100vw - 24px));
          z-index: 10000;
          box-shadow: 0 2px 8px rgba(0,0,0,0.15);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Arial Unicode MS', 'Lucida Sans Unicode', sans-serif;
          text-align: center;
        ">${levelBadge}${safePhonetic ? `<span style="opacity:0.85">${safePhonetic}</span>` : ""}<br><span class="translens-know-btn" data-word="${safeWord}"
            style="display:inline-block;margin-top:3px;font-size:0.75em;color:rgba(255,255,255,0.4);cursor:pointer;transition:color 0.15s;user-select:none;"
            onmousedown="event.preventDefault(); event.stopPropagation();"
            onmouseover="this.style.color='rgba(255,255,255,0.8)'"
            onmouseout="this.style.color='rgba(255,255,255,0.4)'">&#10003; 已掌握</span></span>
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
        // 仅当鼠标真正离开 annotation 时才隐藏（移动到子元素如 popup 时不隐藏）
        if (annotation.contains(e.relatedTarget)) return;
        const phoneticPopup = annotation.querySelector(".translens-phonetic-popup");
        if (phoneticPopup) {
          phoneticPopup.style.display = "none";
        }
      }
    });

    // 点击"已掌握"按钮 → 标记单词为已掌握，不再出现在闪卡中
    // 用 mousedown 而非 click，因为按钮上的 onmousedown preventDefault 会阻止 click 生成（防止父级 <a> 跳转）
    document.addEventListener("mousedown", (e) => {
      const btn = e.target.closest(".translens-know-btn");
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();

      const word = btn.dataset.word;
      if (!word) return;

      // 强制设为已掌握：reviewCount 达到阈值
      let entry = getWordState(word);
      if (!entry) entry = createWordEntry(word);
      entry.reviewCount = config.masteryThreshold || 6;
      entry.repetitions = Math.max(entry.repetitions, 3);
      entry.interval = Math.max(entry.interval, 30);
      entry.nextReview = Date.now() + entry.interval * 86400000;
      entry.lastSeen = Date.now();
      saveSRS();

      // 视觉反馈：移除虚线下划线和翻译标签，显示"已掌握"
      const annotation = btn.closest(".translens-annotation");
      if (annotation) {
        annotation.style.borderBottom = "none";
        annotation.style.cursor = "default";
        const translationEl = annotation.querySelector(".translens-translation");
        if (translationEl) {
          translationEl.innerHTML = '<span style="color:#22C55E;font-size:0.85em;">✓ 已掌握</span>';
          translationEl.style.background = "rgba(34,197,94,0.08)";
        }
        const popup = annotation.querySelector(".translens-phonetic-popup");
        if (popup) popup.style.display = "none";
      }
    });
  }

  // ─── Select-to-Translate (划词翻译) ──────────────────

  const SELECT_ICON_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg>';

  // ── Shadow DOM host ──
  const _slHost = document.createElement("div");
  _slHost.id = "translens-select-host";
  const _slRoot = _slHost.attachShadow({ mode: "open" });

  _slRoot.innerHTML = `
    <style>
      :host { all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647; pointer-events: none; }
      * { box-sizing: border-box; margin: 0; padding: 0; }

      #tl-float-btn {
        display: none; position: fixed; z-index: 2147483647;
        width: 32px; height: 32px; border-radius: 50%;
        background: #3b82f6; color: #fff; border: none; cursor: pointer;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        align-items: center; justify-content: center;
        pointer-events: auto; transition: transform 0.12s, background 0.12s;
      }
      #tl-float-btn:hover { background: #2563eb; transform: scale(1.1); }

      #tl-popup {
        display: none; position: fixed; z-index: 2147483646;
        background: #fff; border-radius: 10px;
        box-shadow: 0 4px 24px rgba(0,0,0,0.16);
        padding: 16px; min-width: 240px; max-width: 360px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px; color: #111827;
        pointer-events: auto; line-height: 1.5;
      }
      #tl-popup .tl-word { font-size: 18px; font-weight: 700; margin-bottom: 2px; word-break: break-all; }
      #tl-popup .tl-phonetic { font-size: 12px; color: #9ca3af; margin-bottom: 8px; }
      #tl-popup .tl-translation { font-size: 15px; color: #1f2937; margin-bottom: 4px; font-weight: 600; }
      #tl-popup .tl-context { font-size: 11px; color: #9ca3af; margin-bottom: 10px; font-style: italic; max-height: 2.4em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      #tl-popup .tl-loading { color: #9ca3af; text-align: center; padding: 12px 0; }
      #tl-popup .tl-error { color: #ef4444; text-align: center; padding: 8px 0; font-size: 13px; }
      #tl-popup .tl-actions { display: flex; align-items: center; gap: 8px; }
      #tl-popup .tl-add-btn {
        display: inline-flex; align-items: center; gap: 4px;
        padding: 5px 12px; border-radius: 6px; border: 1px solid #d1d5db;
        background: #f9fafb; color: #374151; font-size: 12px; cursor: pointer;
        transition: all 0.15s; font-family: inherit;
      }
      #tl-popup .tl-add-btn:hover { background: #eff6ff; border-color: #93c5fd; color: #1d4ed8; }
      #tl-popup .tl-add-btn.added { background: #f0fdf4; border-color: #86efac; color: #16a34a; cursor: default; }
      #tl-popup .tl-add-btn.mastered { color: #9ca3af; cursor: default; border-color: #e5e7eb; }
      #tl-popup .tl-level {
        display: inline-block; font-size: 11px; font-weight: 700;
        padding: 1px 5px; border-radius: 3px; color: #fff;
        margin-left: 6px; vertical-align: middle; letter-spacing: 0.5px;
      }

      #tl-toast {
        display: none; position: fixed; z-index: 2147483647;
        bottom: 40px; left: 50%; transform: translateX(-50%);
        background: #1f2937; color: #f9fafb; padding: 10px 20px;
        border-radius: 8px; font-size: 14px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        pointer-events: none; white-space: nowrap;
        animation: tl-toast-in 0.3s ease;
      }
      @keyframes tl-toast-in { from { opacity: 0; transform: translateX(-50%) translateY(10px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
    </style>
    <button id="tl-float-btn">${SELECT_ICON_SVG}</button>
    <div id="tl-popup"></div>
    <div id="tl-toast"></div>
  `;
  document.documentElement.appendChild(_slHost);

  const _floatBtn = _slRoot.getElementById("tl-float-btn");
  const _popup = _slRoot.getElementById("tl-popup");
  const _toast = _slRoot.getElementById("tl-toast");

  // ── State ──
  let _selText = "";
  let _selContext = "";
  let _selRect = null;
  let _currentWord = "";
  let _toastTimer = null;
  let _slCacheLoaded = false;
  const _slCache = {};  // 划词翻译缓存（独立于 SRS，不影响自动标注）
  const LEVEL_COLORS = { A1: "#22C55E", A2: "#84CC16", B1: "#EAB308", B2: "#F97316", C1: "#EF4444" };

  // ── Helpers ──

  function _getSelectionContext(selection) {
    // 向上查找最近的块级元素作为上下文句子
    let node = selection.anchorNode;
    while (node && node !== document.body) {
      if (node.nodeType === 1) {
        const tag = node.tagName.toLowerCase();
        if (["p", "div", "li", "td", "th", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "article", "section", "span"].includes(tag)) {
          const text = (node.textContent || "").trim();
          if (text.length >= 2 && text.length <= 500) return text;
        }
      }
      node = node.parentNode;
    }
    return _selText;
  }

  function _showToast(msg) {
    _toast.textContent = msg;
    _toast.style.display = "block";
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => { _toast.style.display = "none"; }, 2000);
  }

  function _hideAll() {
    _floatBtn.style.display = "none";
    _popup.style.display = "none";
  }

  function _positionAt(el, rect) {
    // 定位在选区上方居中，放不下则放在下方
    el.style.display = "block";
    const ew = el.offsetWidth || 32;
    const eh = el.offsetHeight || 32;
    let top = rect.top - eh - 6;
    let left = rect.left + rect.width / 2 - ew / 2;

    if (top < 4) top = rect.bottom + 6;
    left = Math.max(4, Math.min(left, window.innerWidth - ew - 4));
    top = Math.max(4, top);

    el.style.top = top + "px";
    el.style.left = left + "px";
  }

  function _positionPopup(rect) {
    _popup.style.display = "block";
    const pw = _popup.offsetWidth || 260;
    const ph = _popup.offsetHeight || 120;
    let top = rect.top - ph - 8;
    let left = rect.left + rect.width / 2 - pw / 2;

    if (top < 4) top = rect.bottom + 8;
    left = Math.max(4, Math.min(left, window.innerWidth - pw - 4));
    top = Math.max(4, top);

    _popup.style.top = top + "px";
    _popup.style.left = left + "px";
  }

  // ── Selection Detection ──

  function _handleMouseUp(e) {
    // 忽略来自 Shadow DOM 内部的点击
    if (_slHost.contains(e.target)) return;

    // 延迟一帧，让浏览器完成选区更新
    requestAnimationFrame(() => {
      const sel = window.getSelection();
      const text = (sel && sel.toString()) ? sel.toString().trim() : "";

      if (!text || text.length < 1 || text.length > 100) {
        _hideAll();
        return;
      }

      try {
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (!rect || (rect.width === 0 && rect.height === 0)) {
          _hideAll();
          return;
        }

        _selText = text;
        _selContext = _getSelectionContext(sel);
        _selRect = rect;

        // 显示浮动按钮
        _floatBtn.style.display = "flex";
        _positionAt(_floatBtn, rect);
      } catch (_) {
        _hideAll();
      }
    });
  }

  function _handleMouseDown(e) {
    // 点击 Shadow DOM 外部 → 关闭浮窗
    if (_slHost.contains(e.target)) return;
    _hideAll();
  }

  // ── Translation Popup ──

  async function _loadSLCache() {
    if (_slCacheLoaded) return;
    const { translensSLCache } = await chrome.storage.local.get("translensSLCache");
    Object.assign(_slCache, translensSLCache || {});
    _slCacheLoaded = true;
  }

  async function _saveSLCache() {
    await chrome.storage.local.set({ translensSLCache: _slCache });
  }

  async function _translateAndShow() {
    if (!_selText || !_selRect) return;

    _hideAll();
    _currentWord = _selText;

    // 确保配置已加载
    if (!config.provider) await loadConfig();
    await _loadSLCache();

    // 先显示加载状态
    _popup.innerHTML = '<div class="tl-loading">翻译中...</div>';
    _positionPopup(_selRect);

    // 1. 检查划词翻译缓存
    if (_slCache[_currentWord]) {
      const c = _slCache[_currentWord];
      _renderPopup(_currentWord, c.translation, c.phonetic, _selContext);
      return;
    }

    // 2. 检查 SRS 缓存（来自自动标注的翻译）
    const cached = getCachedTranslation(_currentWord);
    if (cached) {
      _slCache[_currentWord] = { translation: cached.translation, phonetic: cached.phonetic };
      _saveSLCache();
      _renderPopup(_currentWord, cached.translation, cached.phonetic, _selContext);
      return;
    }

    // 3. 调 API 翻译
    const result = await translateWord(_selContext, _currentWord);

    if (result && result.translation) {
      // 缓存到划词翻译缓存（不创建 SRS 条目，不影响自动标注）
      _slCache[_currentWord] = { translation: result.translation, phonetic: result.phonetic || "" };
      _saveSLCache();
      _renderPopup(_currentWord, result.translation, result.phonetic, _selContext);
    } else {
      _popup.innerHTML = '<div class="tl-error">翻译失败，请检查 API 配置</div>';
      _positionPopup(_selRect);
    }
  }

  function _renderPopup(word, translation, phonetic, context) {
    // 刷新 SRS 数据以获取最新状态
    const entry = getWordState(word);
    const state = shouldReview(word);
    const wordLevel = getWordLevel(word);

    const levelBadge = wordLevel
      ? `<span class="tl-level" style="background:${LEVEL_COLORS[wordLevel] || '#6B7280'}">${wordLevel}</span>`
      : "";

    const phoneticHTML = phonetic
      ? `<div class="tl-phonetic">${escapeHTML(phonetic)}</div>`
      : "";

    const contextHTML = (context && context !== word)
      ? `<div class="tl-context">${escapeHTML(context)}</div>`
      : "";

    let addBtnHTML = "";
    if (state === "mastered") {
      addBtnHTML = `<span class="tl-add-btn mastered">已掌握</span>`;
    } else if (entry && isUsableTranslation(entry.translation)) {
      addBtnHTML = `<span class="tl-add-btn added">已在学习 ✓</span>`;
    } else {
      addBtnHTML = `<button class="tl-add-btn" id="tl-add-btn">+ 加入学习库</button>`;
    }

    _popup.innerHTML = `
      <div class="tl-word">${escapeHTML(word)}${levelBadge}</div>
      ${phoneticHTML}
      <div class="tl-translation">${escapeHTML(translation)}</div>
      ${contextHTML}
      <div class="tl-actions">${addBtnHTML}</div>
    `;

    _positionPopup(_selRect);

    // 绑定 [+] 按钮事件
    const addBtn = _popup.querySelector("#tl-add-btn");
    if (addBtn) {
      addBtn.addEventListener("click", () => _addToLibrary(addBtn));
    }
  }

  async function _addToLibrary(btn) {
    await loadConfig();
    await loadSRS();

    let entry = getWordState(_currentWord);
    if (!entry) {
      entry = createWordEntry(_currentWord);
    }
    // 从划词缓存中补充翻译（如果条目翻译为空或来自划词操作）
    if (_slCache[_currentWord]) {
      if (!isUsableTranslation(entry.translation)) {
        entry.translation = _slCache[_currentWord].translation;
        entry.phonetic = _slCache[_currentWord].phonetic || "";
      }
    }
    entry.contextSentence = _selContext || _currentWord;
    entry.addedFrom = "manual";
    await saveSRS();

    btn.textContent = "已加入 ✓";
    btn.classList.add("added");
    btn.style.pointerEvents = "none";
    btn.disabled = true;

    _showToast("已加入学习库");
  }

  // ── Event Listeners ──

  document.addEventListener("mouseup", _handleMouseUp);
  document.addEventListener("mousedown", _handleMouseDown);

  // 浮动按钮点击 → 翻译
  _floatBtn.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  _floatBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    _translateAndShow();
  });

  // 右键菜单 / 快捷键消息
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "TRANSLATE_CONTEXT" || msg.type === "TRANSLATE_HOTKEY") {
      const sel = window.getSelection();
      const text = (sel && sel.toString()) ? sel.toString().trim() : "";
      if (!text || text.length > 100) return;

      try {
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (!rect || (rect.width === 0 && rect.height === 0)) return;

        _selText = text;
        _selContext = _getSelectionContext(sel);
        _selRect = rect;
        _translateAndShow();
      } catch (_) {}
    }
  });

  waitForPageLoad();
})();

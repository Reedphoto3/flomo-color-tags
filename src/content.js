(function runFlomoColorTags() {
  "use strict";

  const colors = globalThis.FlomoColorTags;
  if (!colors || !globalThis.chrome || !chrome.storage) {
    return;
  }

  const SETTINGS_KEY = "settings";
  const APPLIED_SELECTOR = "[data-flomo-color-tag='true']";
  const TAG_SELECTOR = [
    "[data-tag]",
    "[data-tag-name]",
    "[data-tag-path]",
    "[class~='tag']",
    "[class*='tag-']",
    "[class*='_tag']",
    "a[href*='tag']"
  ].join(",");
  const PAGE_THEME_ATTRIBUTES = ["class", "data-theme", "data-color-mode", "style"];

  let settings = colors.cloneDefaultSettings();
  let pendingNodes = new Set();
  let flushScheduled = false;
  let stopped = false;
  let contentObserver = null;
  let themeObserver = null;

  function isContextInvalidatedError(error) {
    const message = typeof error === "string" ? error : error && error.message;
    return /extension context invalidated/i.test(message || "");
  }

  function stopProcessing() {
    if (stopped) {
      return;
    }
    stopped = true;
    pendingNodes.clear();
    contentObserver?.disconnect();
    themeObserver?.disconnect();
  }

  function handleExtensionError(error) {
    if (isContextInvalidatedError(error)) {
      // 重新加载扩展后，旧内容脚本会短暂留在已打开页面中。此时 Chrome / Vivaldi
      // 会拒绝其 storage 调用；停止旧脚本即可，刷新页面后会注入新脚本。
      stopProcessing();
      return;
    }
    console.warn("[flomo 彩色标签] 初始化失败", error);
  }

  function hasLiveExtensionContext() {
    if (stopped) {
      return false;
    }
    try {
      // 扩展重载后，旧内容脚本仍可能收到 MutationObserver 或动画帧回调。
      // Chromium 会让 runtime.id 变为空；先检查并停止，避免旧脚本再扫描 DOM。
      if (!chrome.runtime?.id) {
        stopProcessing();
        return false;
      }
      return true;
    } catch (error) {
      handleExtensionError(error);
      return false;
    }
  }

  function getDirectText(element) {
    return Array.from(element.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent || "")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isMeaningfulTagText(value) {
    const normalized = colors.normalizeTag(value);
    return Boolean(
      normalized &&
      !/^\d+$/.test(normalized) &&
      /[\p{L}\p{N}\u3400-\u9fff]/u.test(normalized)
    );
  }

  function getFirstLeafTagText(element) {
    const elements = [element, ...Array.from(element.querySelectorAll("span, a, div, li, p, button")).slice(0, 80)];

    for (const candidate of elements) {
      const directText = getDirectText(candidate);
      if (isMeaningfulTagText(directText)) {
        return directText;
      }

      if (candidate.children.length === 0) {
        const leafText = (candidate.textContent || "").replace(/\s+/g, " ").trim();
        if (isMeaningfulTagText(leafText)) {
          return leafText;
        }
      }
    }

    return "";
  }

  function getRawTagText(element) {
    const attributes = ["data-tag", "data-tag-name", "data-tag-path"];
    for (const attribute of attributes) {
      const value = element.getAttribute(attribute);
      if (value && value.trim()) {
        return value.trim();
      }
    }

    // 展开一级标签后，外层容器会同时包含父标签和全部子标签。
    // 先取 DOM 顺序中第一个有效叶节点，避免把整个展开组拼成颜色键。
    return getFirstLeafTagText(element) || (element.textContent || "").replace(/\s+/g, " ").trim();
  }

  function hasTagClass(element) {
    const className = typeof element.className === "string" ? element.className : "";
    return /(?:^|[\s_-])tags?(?:$|[\s_-])/i.test(className);
  }

  function hasTagSignal(element, rawText) {
    const href = element.getAttribute("href") || "";
    return Boolean(
      element.hasAttribute("data-tag") ||
      element.hasAttribute("data-tag-name") ||
      element.hasAttribute("data-tag-path") ||
      hasTagClass(element) ||
      /(?:\/|[?&])tag(?:\/|=|$)/i.test(href) ||
      rawText.startsWith("#")
    );
  }

  function isEditable(element) {
    return Boolean(element.closest("[contenteditable='true'], textarea, input, [role='textbox'], pre, code"));
  }

  function isTagPickerCandidate(element) {
    // 标签输入的候选菜单会被挂在编辑器外层（常见于 body 下的 popover），
    // 因而不能只依赖 isEditable。若给候选项上色，带颜色的行会以
    // !important 覆盖 flomo 原本的键盘选中高亮。
    if (isSidebarTag(element)) {
      return false;
    }

    const semanticPickerSelector = [
      "[role='listbox']",
      "[role='option']",
      "[role='menu']",
      "[role='menuitem']",
      "[aria-autocomplete='list']",
      "[data-popper-placement]",
      "[data-popper-reference-hidden]"
    ].join(",");
    if (element.closest(semanticPickerSelector)) {
      return true;
    }

    // flomo 的不同页面版本未必带 ARIA 属性；补充识别常见的“标签 +
    // 候选/下拉”命名。只匹配两个语义同时存在的类或 id，避免误伤正文标签。
    const pickerNamePattern = /(?:tag|tags|label)[-_\s]*(?:suggest|suggestion|autocomplete|candidate|option|select|selector|picker|dropdown|popup|popper|menu)|(?:suggest|suggestion|autocomplete|candidate|option|select|selector|picker|dropdown|popup|popper|menu)[-_\s]*(?:tag|tags|label)/i;
    for (let ancestor = element; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
      const className = typeof ancestor.className === "string" ? ancestor.className : "";
      const identifier = `${ancestor.id || ""} ${className}`;
      if (pickerNamePattern.test(identifier)) {
        return true;
      }
    }

    return false;
  }

  function hasMultipleNestedTagCandidates(element) {
    let count = 0;
    for (const nested of element.querySelectorAll(TAG_SELECTOR)) {
      if (nested === element || isEditable(nested)) {
        continue;
      }
      // `TAG_SELECTOR` 中有面向改版兼容的宽松 class 匹配；这里再用标签
      // 信号过滤，避免普通布局节点被当成一个标签。
      if (!hasTagSignal(nested, "")) {
        continue;
      }
      count += 1;
      if (count >= 2) {
        return true;
      }
    }
    return false;
  }

  function getSidebarStyleTarget(element) {
    const originalRect = element.getBoundingClientRect();
    let target = element;
    let ancestor = element.parentElement;

    // 侧栏真实标签文字通常位于“图标 + 标签文字 + 数量”这一行的内部节点。
    // 选择同一行的更宽祖先，使色块覆盖整行；多标签分组通常比单行高得多，
    // 因而按高度止步，避免把整组标签误染成同一种颜色。
    for (let depth = 0; ancestor && depth < 4; depth += 1, ancestor = ancestor.parentElement) {
      if (!isSidebarTag(ancestor)) {
        break;
      }
      const rect = ancestor.getBoundingClientRect();
      const isTooTall = rect.height > Math.max(originalRect.height * 1.6, 72);
      if (isTooTall && hasMultipleNestedTagCandidates(ancestor)) {
        break;
      }
      if (
        rect.width >= originalRect.width + 48 &&
        rect.height > 0 &&
        rect.height <= Math.max(originalRect.height * 1.6, 72)
      ) {
        target = ancestor;
      }
    }
    return target;
  }

  function isLikelyTagElement(element) {
    if (!(element instanceof Element) || isEditable(element)) {
      return false;
    }

    if (isTagPickerCandidate(element)) {
      return false;
    }

    // 侧边栏的“置顶标签”等容器会包含多条真实标签。若给容器着色，CSS 的
    // `color: inherit` 会把第一条标签的颜色扩散到整组，造成所有标签同色。
    if (hasMultipleNestedTagCandidates(element)) {
      return false;
    }

    const rawText = getRawTagText(element);
    const normalized = colors.normalizeTag(rawText);
    if (!normalized || normalized.length > 120 || /[\r\n]/.test(rawText)) {
      return false;
    }

    if (!hasTagSignal(element, rawText)) {
      return false;
    }

    return element.children.length <= 4;
  }

  function isSidebarTag(element) {
    return Boolean(element.closest("[id*='sidebar' i], [class*='sidebar' i], [id*='nav' i], [class*='nav' i]"));
  }

  function isDarkTheme() {
    const root = document.documentElement;
    const body = document.body;
    const rootText = `${root.className || ""} ${root.getAttribute("data-theme") || ""} ${root.getAttribute("data-color-mode") || ""}`;
    const bodyText = body ? `${body.className || ""} ${body.getAttribute("data-theme") || ""}` : "";
    const explicitTheme = `${rootText} ${bodyText}`.toLowerCase();

    if (/(^|\s|[-_])dark($|\s|[-_])/.test(explicitTheme)) {
      return true;
    }

    const colorScheme = getComputedStyle(root).colorScheme;
    if (colorScheme && colorScheme.includes("dark")) {
      return true;
    }

    return globalThis.matchMedia && globalThis.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function clearElementStyle(element) {
    if (!element.matches(APPLIED_SELECTOR)) {
      return;
    }

    element.removeAttribute("data-flomo-color-tag");
    delete element.dataset.flomoColorTagKey;
    delete element.dataset.flomoColorTagTheme;
    delete element.dataset.flomoColorTagAppearance;
    delete element.dataset.flomoColorTagScope;
    element.style.removeProperty("--flomo-color-tag-background");
    element.style.removeProperty("--flomo-color-tag-text");
    element.style.removeProperty("--flomo-color-tag-border");
  }

  function styleTag(element) {
    if (!hasLiveExtensionContext()) {
      return;
    }
    if (!settings.enabled || !isLikelyTagElement(element)) {
      clearElementStyle(element);
      return;
    }

    const sidebar = isSidebarTag(element);
    const styleElement = sidebar ? getSidebarStyleTarget(element) : element;
    if (styleElement !== element) {
      clearElementStyle(element);
    }
    if ((sidebar && !settings.sidebarEnabled) || (!sidebar && !settings.contentEnabled)) {
      clearElementStyle(styleElement);
      return;
    }

    const tagValue = colors.normalizeTag(getRawTagText(element));
    const dark = isDarkTheme();
    const theme = dark ? "dark" : "light";
    const appearance = colors.resolveTagAppearance(
      tagValue,
      settings.overrides,
      settings.colorMode === "automatic"
    );
    if (!appearance) {
      clearElementStyle(styleElement);
      return;
    }
    const token = appearance[theme];
    const appearanceKey = [appearance.paletteName, token.background, token.text, token.border].join("|");

    if (
      styleElement.matches(APPLIED_SELECTOR) &&
      styleElement.dataset.flomoColorTagKey === tagValue &&
      styleElement.dataset.flomoColorTagTheme === theme &&
      styleElement.dataset.flomoColorTagAppearance === appearanceKey &&
      styleElement.dataset.flomoColorTagScope === (sidebar ? "sidebar" : "content")
    ) {
      return;
    }

    styleElement.setAttribute("data-flomo-color-tag", "true");
    styleElement.dataset.flomoColorTagKey = tagValue;
    styleElement.dataset.flomoColorTagTheme = theme;
    styleElement.dataset.flomoColorTagAppearance = appearanceKey;
    styleElement.dataset.flomoColorTagScope = sidebar ? "sidebar" : "content";
    styleElement.style.setProperty("--flomo-color-tag-background", token.background);
    styleElement.style.setProperty("--flomo-color-tag-text", token.text);
    styleElement.style.setProperty("--flomo-color-tag-border", token.border);
  }

  function getCandidates(root) {
    const candidates = [];
    if (!(root instanceof Element) && root !== document) {
      return candidates;
    }

    if (root instanceof Element) {
      const closest = root.closest(TAG_SELECTOR);
      if (closest) {
        candidates.push(closest);
      }
      if (root.matches(TAG_SELECTOR)) {
        candidates.push(root);
      }
    }

    const scope = root === document ? document : root;
    for (const candidate of scope.querySelectorAll(TAG_SELECTOR)) {
      candidates.push(candidate);
    }
    return candidates;
  }

  function processRoot(root) {
    if (!hasLiveExtensionContext()) {
      return;
    }
    const uniqueCandidates = new Set(getCandidates(root));
    for (const candidate of uniqueCandidates) {
      const parentTag = candidate.parentElement && candidate.parentElement.closest(APPLIED_SELECTOR);
      if (parentTag && parentTag !== candidate && parentTag.dataset.flomoColorTagScope !== "sidebar") {
        continue;
      }
      styleTag(candidate);
    }
  }

  function clearAllStyles() {
    for (const element of document.querySelectorAll(APPLIED_SELECTOR)) {
      clearElementStyle(element);
    }
  }

  function scheduleRoot(root) {
    if (!hasLiveExtensionContext()) {
      return;
    }
    if (root instanceof Element || root === document) {
      pendingNodes.add(root);
    }

    if (flushScheduled) {
      return;
    }

    flushScheduled = true;
    globalThis.requestAnimationFrame(() => {
      if (!hasLiveExtensionContext()) {
        flushScheduled = false;
        return;
      }
      flushScheduled = false;
      const roots = pendingNodes;
      pendingNodes = new Set();
      for (const changedRoot of roots) {
        processRoot(changedRoot);
      }
    });
  }

  function observePage() {
    contentObserver = new MutationObserver((records) => {
      if (!hasLiveExtensionContext()) {
        return;
      }
      for (const record of records) {
        if (record.type === "characterData") {
          scheduleRoot(record.target.parentElement);
          continue;
        }
        for (const node of record.addedNodes) {
          if (node instanceof Element) {
            scheduleRoot(node);
          } else if (node.parentElement) {
            scheduleRoot(node.parentElement);
          }
        }
      }
    });

    contentObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });

    themeObserver = new MutationObserver(() => {
      if (hasLiveExtensionContext()) {
        scheduleRoot(document);
      }
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: PAGE_THEME_ATTRIBUTES
    });

    if (document.body) {
      themeObserver.observe(document.body, {
        attributes: true,
        attributeFilter: PAGE_THEME_ATTRIBUTES
      });
    }
  }

  function initialize() {
    if (!hasLiveExtensionContext()) {
      return;
    }
    try {
      // Vivaldi 在扩展重载时会使旧内容脚本的 Promise 上下文失效，哪怕外层
      // 已有 catch，仍可能把 rejected Promise 记录到扩展错误页。storage 回调
      // API 通过 runtime.lastError 报告此情况，不会留下悬挂 Promise。
      chrome.storage.local.get(SETTINGS_KEY, (stored) => {
        try {
          const storageError = chrome.runtime && chrome.runtime.lastError;
          if (storageError) {
            handleExtensionError(storageError);
            return;
          }
          if (!hasLiveExtensionContext()) {
            return;
          }
          settings = colors.sanitizeSettings(stored && stored[SETTINGS_KEY]);
          observePage();
          scheduleRoot(document);
        } catch (error) {
          handleExtensionError(error);
        }
      });
    } catch (error) {
      handleExtensionError(error);
    }
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (!hasLiveExtensionContext() || areaName !== "local") {
      return;
    }

    if (changes[SETTINGS_KEY]) {
      settings = colors.sanitizeSettings(changes[SETTINGS_KEY].newValue);
      if (!settings.enabled) {
        clearAllStyles();
      } else {
        scheduleRoot(document);
      }
    }

  });

  globalThis.addEventListener("unhandledrejection", (event) => {
    if (isContextInvalidatedError(event.reason)) {
      event.preventDefault();
      stopProcessing();
    }
  });

  initialize();
})();

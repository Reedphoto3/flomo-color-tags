(function runFlomoColorTags() {
  "use strict";

  const colors = globalThis.FlomoColorTags;
  const detection = globalThis.FlomoTagDetection;
  const rendering = globalThis.FlomoTagRendering;
  if (!colors || !detection || !rendering || !globalThis.chrome || !chrome.storage) {
    return;
  }

  const SETTINGS_KEY = "settings";
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

  const renderer = rendering.createRenderer({
    colors,
    detection,
    document,
    getSettings: () => settings,
    isLive: hasLiveExtensionContext
  });

  function scheduleRoot(root) {
    if (!hasLiveExtensionContext()) {
      return;
    }
    if ((root && root.nodeType === 1) || root === document) {
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
        renderer.processRoot(changedRoot);
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
        if (record.type === "attributes") {
          scheduleRoot(record.target);
          continue;
        }
        scheduleRoot(record.target);
        for (const node of record.addedNodes) {
          scheduleRoot(node.nodeType === 1 ? node : node.parentElement);
        }
      }
    });

    contentObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: detection.OBSERVED_TAG_ATTRIBUTES
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
        renderer.clearAllStyles();
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

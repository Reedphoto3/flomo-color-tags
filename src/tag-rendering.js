(function exposeTagRendering(root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.FlomoTagRendering = api;
  }
})(typeof globalThis === "undefined" ? this : globalThis, function createTagRenderingApi() {
  "use strict";

  function createRenderer(options) {
    const {
      colors,
      detection,
      document,
      getSettings,
      isLive = () => true,
      getComputedStyle = globalThis.getComputedStyle,
      matchMedia = globalThis.matchMedia
    } = options;
    const sourceTargets = new WeakMap();

    function isDarkTheme() {
      const root = document.documentElement;
      const body = document.body;
      const rootText = [
        root.className || "",
        root.getAttribute("data-theme") || "",
        root.getAttribute("data-color-mode") || ""
      ].join(" ");
      const bodyText = body
        ? [
            body.className || "",
            body.getAttribute("data-theme") || "",
            body.getAttribute("data-color-mode") || ""
          ].join(" ")
        : "";
      const colorScheme = typeof getComputedStyle === "function"
        ? getComputedStyle(root).colorScheme
        : "";
      const prefersDark = Boolean(
        typeof matchMedia === "function" &&
        matchMedia("(prefers-color-scheme: dark)").matches
      );
      return colors.resolveDarkTheme(`${rootText} ${bodyText}`, colorScheme, prefersDark);
    }

    function clearElementStyle(element) {
      if (!element || !element.matches(detection.APPLIED_SELECTOR)) {
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

    function clearSourceStyle(source) {
      const previousTarget = sourceTargets.get(source);
      if (previousTarget) {
        clearElementStyle(previousTarget);
        sourceTargets.delete(source);
      }
      clearElementStyle(source);
    }

    function styleTag(source) {
      if (!isLive()) {
        return;
      }

      const settings = getSettings();
      if (!settings.enabled || !detection.isLikelyTagElement(source, colors)) {
        clearSourceStyle(source);
        return;
      }

      const sidebar = detection.isSidebarTag(source);
      const pinned = sidebar && detection.isPinnedSidebarTag(source);
      const styleElement = sidebar ? detection.getSidebarStyleTarget(source) : source;
      const previousTarget = sourceTargets.get(source);
      if (previousTarget && previousTarget !== styleElement) {
        clearElementStyle(previousTarget);
      }
      if (styleElement !== source) {
        clearElementStyle(source);
      }
      sourceTargets.set(source, styleElement);

      if ((sidebar && !settings.sidebarEnabled) || (!sidebar && !settings.contentEnabled)) {
        clearSourceStyle(source);
        return;
      }

      const tagValue = colors.normalizeTag(detection.getRawTagText(source, colors));
      const theme = isDarkTheme() ? "dark" : "light";
      const fallbackToAuto = settings.colorMode === "automatic"
        || (pinned && settings.pinnedTagsAutoColor === true);
      const appearance = colors.resolveTagAppearance(
        tagValue,
        settings.overrides,
        fallbackToAuto
      );
      if (!appearance) {
        clearSourceStyle(source);
        return;
      }

      const token = appearance[theme];
      const appearanceKey = [
        appearance.paletteName,
        token.background,
        token.text,
        token.border
      ].join("|");
      const scope = sidebar ? "sidebar" : "content";
      if (
        styleElement.matches(detection.APPLIED_SELECTOR) &&
        styleElement.dataset.flomoColorTagKey === tagValue &&
        styleElement.dataset.flomoColorTagTheme === theme &&
        styleElement.dataset.flomoColorTagAppearance === appearanceKey &&
        styleElement.dataset.flomoColorTagScope === scope
      ) {
        return;
      }

      styleElement.setAttribute("data-flomo-color-tag", "true");
      styleElement.dataset.flomoColorTagKey = tagValue;
      styleElement.dataset.flomoColorTagTheme = theme;
      styleElement.dataset.flomoColorTagAppearance = appearanceKey;
      styleElement.dataset.flomoColorTagScope = scope;
      styleElement.style.setProperty("--flomo-color-tag-background", token.background);
      styleElement.style.setProperty("--flomo-color-tag-text", token.text);
      styleElement.style.setProperty("--flomo-color-tag-border", token.border);
    }

    function processRoot(root) {
      if (!isLive()) {
        return;
      }

      const uniqueCandidates = new Set(detection.getCandidates(root, document));
      for (const candidate of uniqueCandidates) {
        const parentTag = candidate.parentElement
          && candidate.parentElement.closest(detection.APPLIED_SELECTOR);
        if (
          parentTag &&
          parentTag !== candidate &&
          parentTag.dataset.flomoColorTagScope !== "sidebar"
        ) {
          continue;
        }
        styleTag(candidate);
      }
    }

    function clearAllStyles() {
      for (const element of document.querySelectorAll(detection.APPLIED_SELECTOR)) {
        clearElementStyle(element);
      }
    }

    return Object.freeze({
      isDarkTheme,
      clearElementStyle,
      styleTag,
      processRoot,
      clearAllStyles
    });
  }

  return Object.freeze({ createRenderer });
});

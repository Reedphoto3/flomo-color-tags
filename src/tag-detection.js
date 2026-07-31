(function exposeTagDetection(root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.FlomoTagDetection = api;
  }
})(typeof globalThis === "undefined" ? this : globalThis, function createTagDetection() {
  "use strict";

  const TAG_SELECTOR = [
    "[tag]",
    "[data-tag]",
    "[data-tag-name]",
    "[data-tag-path]",
    "[class~='tag']",
    "[class*='tag-']",
    "[class*='_tag']",
    "a[href*='tag']"
  ].join(",");
  const APPLIED_SELECTOR = "[data-flomo-color-tag='true']";
  const OBSERVED_TAG_ATTRIBUTES = Object.freeze([
    "tag",
    "data-tag",
    "data-tag-name",
    "data-tag-path",
    "href",
    "class",
    "id",
    "role",
    "contenteditable"
  ]);

  function isElement(value) {
    return Boolean(value && value.nodeType === 1 && typeof value.matches === "function");
  }

  function getDirectText(element) {
    return Array.from(element.childNodes)
      .filter((node) => node.nodeType === 3)
      .map((node) => node.textContent || "")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isMeaningfulTagText(value, colors) {
    const normalized = colors.normalizeTag(value);
    return Boolean(
      normalized &&
      !/^\d+$/.test(normalized) &&
      /[\p{L}\p{N}\u3400-\u9fff]/u.test(normalized)
    );
  }

  function getFirstLeafTagText(element, colors) {
    const descendants = Array.from(
      element.querySelectorAll("span, a, div, li, p, button")
    ).slice(0, 80);

    for (const candidate of [element, ...descendants]) {
      const directText = getDirectText(candidate);
      if (isMeaningfulTagText(directText, colors)) {
        return directText;
      }

      if (candidate.children.length === 0) {
        const leafText = (candidate.textContent || "").replace(/\s+/g, " ").trim();
        if (isMeaningfulTagText(leafText, colors)) {
          return leafText;
        }
      }
    }

    return "";
  }

  function isSidebarTag(element) {
    return Boolean(
      element.closest("[id*='sidebar' i], [class*='sidebar' i], [id*='nav' i], [class*='nav' i]")
    );
  }

  function getSidebarTagOwner(element) {
    if (!isSidebarTag(element)) {
      return null;
    }
    if (element.hasAttribute("tag")) {
      return element;
    }
    if (element.matches(".tag-label, [class~='tag-label']")) {
      return element.closest("[tag]");
    }
    return null;
  }

  function getRawTagText(element, colors) {
    for (const attribute of ["data-tag", "data-tag-name", "data-tag-path"]) {
      const value = element.getAttribute(attribute);
      if (value && value.trim()) {
        return isSidebarTag(element) ? colors.stripSidebarCount(value) : value.trim();
      }
    }
    if (isSidebarTag(element)) {
      const tagOwner = getSidebarTagOwner(element);
      const tagPath = tagOwner && tagOwner.getAttribute("tag");
      if (tagPath && tagPath.trim()) {
        return colors.stripSidebarCount(tagPath);
      }
    }

    // 展开的标签树外层会同时包含父标签和多个子标签。优先取第一个有效
    // 叶节点，避免把整组文字拼成一个颜色键。
    const rawText = getFirstLeafTagText(element, colors)
      || (element.textContent || "").replace(/\s+/g, " ").trim();
    return isSidebarTag(element) ? colors.stripSidebarCount(rawText) : rawText;
  }

  function hasTagClass(element) {
    const className = typeof element.className === "string" ? element.className : "";
    return /(?:^|[\s_-])tags?(?:$|[\s_-])/i.test(className);
  }

  function hasTagSignal(element, rawText) {
    const href = element.getAttribute("href") || "";
    const structuralTag = getSidebarTagOwner(element);
    return Boolean(
      structuralTag ||
      element.hasAttribute("data-tag") ||
      element.hasAttribute("data-tag-name") ||
      element.hasAttribute("data-tag-path") ||
      /(?:\/|[?&])tag(?:\/|=|$)/i.test(href) ||
      rawText.startsWith("#") ||
      (hasTagClass(element) && isSidebarTag(element))
    );
  }

  function hasStrongTagSignal(element, rawText) {
    const href = element.getAttribute("href") || "";
    const structuralTag = getSidebarTagOwner(element);
    return Boolean(
      structuralTag ||
      element.hasAttribute("data-tag") ||
      element.hasAttribute("data-tag-name") ||
      element.hasAttribute("data-tag-path") ||
      /(?:\/|[?&])tag(?:\/|=|$)/i.test(href) ||
      rawText.startsWith("#")
    );
  }

  function isEditable(element) {
    return Boolean(
      element.closest("[contenteditable='true'], textarea, input, [role='textbox'], pre, code")
    );
  }

  function isTagPickerCandidate(element) {
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

    const pickerNamePattern = /(?:tag|tags|label)[-_\s]*(?:suggest|suggestion|autocomplete|candidate|option|select|selector|picker|dropdown|popup|popper|menu)|(?:suggest|suggestion|autocomplete|candidate|option|select|selector|picker|dropdown|popup|popper|menu)[-_\s]*(?:tag|tags|label)/i;
    for (
      let ancestor = element;
      ancestor && ancestor !== element.ownerDocument.body;
      ancestor = ancestor.parentElement
    ) {
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

  function getRect(element) {
    if (typeof element.getBoundingClientRect === "function") {
      return element.getBoundingClientRect();
    }
    return { width: 0, height: 0 };
  }

  function getSidebarStyleTarget(element) {
    const originalRect = getRect(element);
    let target = element;
    let ancestor = element.parentElement;

    for (let depth = 0; ancestor && depth < 4; depth += 1, ancestor = ancestor.parentElement) {
      if (!isSidebarTag(ancestor)) {
        break;
      }
      const rect = getRect(ancestor);
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

  function isLikelyTagElement(element, colors) {
    if (!isElement(element) || isEditable(element) || isTagPickerCandidate(element)) {
      return false;
    }
    if (hasMultipleNestedTagCandidates(element)) {
      return false;
    }

    const rawText = getRawTagText(element, colors);
    const normalized = colors.normalizeTag(rawText);
    if (!normalized || normalized.length > 120 || /[\r\n]/.test(rawText)) {
      return false;
    }
    if (!hasTagSignal(element, rawText)) {
      return false;
    }
    if (
      !hasStrongTagSignal(element, rawText) &&
      element.parentElement &&
      element.parentElement.closest(
        "[tag], [data-tag], [data-tag-name], [data-tag-path], a[href*='tag']"
      )
    ) {
      return false;
    }
    return element.children.length <= 4;
  }

  function getCandidates(root, document) {
    const candidates = [];
    if (!isElement(root) && root !== document) {
      return candidates;
    }

    if (isElement(root)) {
      // 属性变化后，节点可能已经不再匹配标签选择器。仍把变化节点交给
      // 渲染层处理，才能清除先前残留的颜色。
      candidates.push(root);
      const closest = root.closest(TAG_SELECTOR);
      if (closest && closest !== root) {
        candidates.push(closest);
      }
    }

    const scope = root === document ? document : root;
    for (const candidate of scope.querySelectorAll(TAG_SELECTOR)) {
      candidates.push(candidate);
    }
    return candidates;
  }

  return Object.freeze({
    TAG_SELECTOR,
    APPLIED_SELECTOR,
    OBSERVED_TAG_ATTRIBUTES,
    getDirectText,
    getRawTagText,
    hasTagSignal,
    isEditable,
    isTagPickerCandidate,
    hasMultipleNestedTagCandidates,
    getSidebarStyleTarget,
    isLikelyTagElement,
    isSidebarTag,
    getCandidates
  });
});

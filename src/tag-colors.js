(function exposeTagColors(root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.FlomoColorTags = api;
  }
})(typeof globalThis === "undefined" ? this : globalThis, function createTagColors() {
  "use strict";

  const PALETTE = Object.freeze({
    coral: Object.freeze({
      label: "珊瑚红",
      light: Object.freeze({ background: "#fff0ef", text: "#9b2c2c", border: "#f9b7b2" }),
      dark: Object.freeze({ background: "#4c2222", text: "#fecaca", border: "#9b3d3d" })
    }),
    amber: Object.freeze({
      label: "琥珀黄",
      light: Object.freeze({ background: "#fff8e6", text: "#8a5300", border: "#f4cf7a" }),
      dark: Object.freeze({ background: "#4b3512", text: "#fde68a", border: "#9a6a16" })
    }),
    orange: Object.freeze({
      label: "陶土橙",
      light: Object.freeze({ background: "#fff3ea", text: "#9a3f12", border: "#efbd99" }),
      dark: Object.freeze({ background: "#512c1d", text: "#ffd7bf", border: "#ad6040" })
    }),
    jade: Object.freeze({
      label: "翡翠绿",
      light: Object.freeze({ background: "#edfbf3", text: "#166534", border: "#9fe0b8" }),
      dark: Object.freeze({ background: "#163d2b", text: "#bbf7d0", border: "#2f855a" })
    }),
    teal: Object.freeze({
      label: "青绿色",
      light: Object.freeze({ background: "#eafaf9", text: "#0f5f5a", border: "#91ded7" }),
      dark: Object.freeze({ background: "#153e3d", text: "#b8f3ed", border: "#277a74" })
    }),
    sky: Object.freeze({
      label: "天空蓝",
      light: Object.freeze({ background: "#edf7ff", text: "#1e5e96", border: "#a8d2f5" }),
      dark: Object.freeze({ background: "#173957", text: "#c7e7ff", border: "#2d70aa" })
    }),
    slate: Object.freeze({
      label: "石墨蓝灰",
      light: Object.freeze({ background: "#f1f4f8", text: "#334155", border: "#b8c4d3" }),
      dark: Object.freeze({ background: "#263241", text: "#d1dbe8", border: "#52657a" })
    }),
    indigo: Object.freeze({
      label: "靛蓝",
      light: Object.freeze({ background: "#f0f1ff", text: "#4338a3", border: "#bfc3ff" }),
      dark: Object.freeze({ background: "#292857", text: "#d8dcff", border: "#5c5fc7" })
    }),
    violet: Object.freeze({
      label: "紫罗兰",
      light: Object.freeze({ background: "#f8f0ff", text: "#6b2e9b", border: "#d9b5f2" }),
      dark: Object.freeze({ background: "#42254f", text: "#edceff", border: "#8650a5" })
    }),
    rose: Object.freeze({
      label: "玫瑰粉",
      light: Object.freeze({ background: "#fff0f6", text: "#a61e5c", border: "#f2b5cf" }),
      dark: Object.freeze({ background: "#4b1f39", text: "#fecde4", border: "#a33b75" })
    })
  });

  const PALETTE_NAMES = Object.freeze(Object.keys(PALETTE));
  // 公共源码不内置任何个人标签。用户自己的规则只保存在浏览器的
  // chrome.storage.local 中，新安装后可在设置页自行添加。
  const DEFAULT_TAG_COLORS = Object.freeze({});
  const DEFAULT_SETTINGS = Object.freeze({
    // 配置数据结构版本，与 manifest.json 中的扩展版本无关。
    // 仅在持久化设置结构发生变化时递增。
    settingsVersion: 9,
    enabled: true,
    contentEnabled: true,
    sidebarEnabled: true,
    colorMode: "manual",
    overrides: DEFAULT_TAG_COLORS
  });

  function cloneDefaultSettings() {
    return {
      settingsVersion: DEFAULT_SETTINGS.settingsVersion,
      enabled: DEFAULT_SETTINGS.enabled,
      contentEnabled: DEFAULT_SETTINGS.contentEnabled,
      sidebarEnabled: DEFAULT_SETTINGS.sidebarEnabled,
      colorMode: DEFAULT_SETTINGS.colorMode,
      overrides: { ...DEFAULT_TAG_COLORS }
    };
  }

  function normalizeTag(value) {
    if (typeof value !== "string" && typeof value !== "number") {
      return "";
    }

    return String(value)
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^#+\s*/, "")
      .replace(/\s*\/\s*/g, "/")
      .replace(/^\/+|\/+$/g, "")
      .trim();
  }

  function stripSidebarCount(value) {
    if (typeof value !== "string" && typeof value !== "number") {
      return "";
    }

    // 裸数字可能是标签名的一部分（例如 “GPT 5” 或 “计划 2026”）。
    // 这里只移除侧边栏中具有明确计数语义的后缀。
    return String(value)
      .replace(/\s+[（(]\s*\d+\s*[)）]\s*$/, "")
      .replace(/\s+\d+\s*(?:条|则|个|篇|notes?|memos?)\s*$/i, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function getTagKeys(value) {
    const full = normalizeTag(value);
    const root = full.split("/").filter(Boolean)[0] || "";
    return { full, root };
  }

  function hashString(value) {
    let hash = 2166136261;
    const input = String(value);

    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }

    return hash >>> 0;
  }

  function getAutoPaletteName(value) {
    const root = getTagKeys(value).root;
    if (!root) {
      return PALETTE_NAMES[0];
    }
    return PALETTE_NAMES[hashString(root) % PALETTE_NAMES.length];
  }

  function isHexColor(value) {
    return typeof value === "string" && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim());
  }

  function hexToRgb(value) {
    const normalized = value.trim().slice(1);
    const expanded = normalized.length === 3
      ? normalized.split("").map((part) => part + part).join("")
      : normalized;

    return {
      red: Number.parseInt(expanded.slice(0, 2), 16),
      green: Number.parseInt(expanded.slice(2, 4), 16),
      blue: Number.parseInt(expanded.slice(4, 6), 16)
    };
  }

  function mixRgb(base, target, targetRatio) {
    const baseRatio = 1 - targetRatio;
    return {
      red: Math.round(base.red * baseRatio + target.red * targetRatio),
      green: Math.round(base.green * baseRatio + target.green * targetRatio),
      blue: Math.round(base.blue * baseRatio + target.blue * targetRatio)
    };
  }

  function rgbToHex(color) {
    return `#${[color.red, color.green, color.blue]
      .map((part) => Math.max(0, Math.min(255, part)).toString(16).padStart(2, "0"))
      .join("")}`;
  }

  function linearizeColorChannel(value) {
    const channel = value / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  }

  function getRelativeLuminance(value) {
    const color = typeof value === "string" ? hexToRgb(value) : value;
    return (
      0.2126 * linearizeColorChannel(color.red) +
      0.7152 * linearizeColorChannel(color.green) +
      0.0722 * linearizeColorChannel(color.blue)
    );
  }

  function getContrastRatio(first, second) {
    const light = Math.max(getRelativeLuminance(first), getRelativeLuminance(second));
    const dark = Math.min(getRelativeLuminance(first), getRelativeLuminance(second));
    return (light + 0.05) / (dark + 0.05);
  }

  function ensureReadableText(text, background, minimumRatio = 4.5) {
    if (getContrastRatio(text, background) >= minimumRatio) {
      return rgbToHex(typeof text === "string" ? hexToRgb(text) : text);
    }

    const current = typeof text === "string" ? hexToRgb(text) : text;
    const black = { red: 0, green: 0, blue: 0 };
    const white = { red: 255, green: 255, blue: 255 };
    const target = getContrastRatio(black, background) >= getContrastRatio(white, background)
      ? black
      : white;

    for (let ratio = 0.05; ratio <= 1; ratio += 0.05) {
      const candidate = mixRgb(current, target, ratio);
      if (getContrastRatio(candidate, background) >= minimumRatio) {
        return rgbToHex(candidate);
      }
    }

    return rgbToHex(target);
  }

  function getCustomAppearance(hex) {
    const base = hexToRgb(hex);
    const white = { red: 255, green: 255, blue: 255 };
    const black = { red: 0, green: 0, blue: 0 };

    const lightBackground = rgbToHex(mixRgb(base, white, 0.86));
    const darkBackground = rgbToHex(mixRgb(base, black, 0.76));
    const lightText = rgbToHex(mixRgb(base, black, 0.34));
    const darkText = rgbToHex(mixRgb(base, white, 0.57));

    return {
      paletteName: "custom",
      light: {
        background: lightBackground,
        text: ensureReadableText(lightText, lightBackground),
        border: rgbToHex(mixRgb(base, white, 0.47))
      },
      dark: {
        background: darkBackground,
        text: ensureReadableText(darkText, darkBackground),
        border: rgbToHex(mixRgb(base, black, 0.25))
      }
    };
  }

  function resolveDarkTheme(explicitTheme, colorScheme, prefersDark) {
    const explicit = String(explicitTheme || "").toLowerCase();
    const hasExplicitDark = /(^|[\s"'=:;,_-])dark($|[\s"'=:;,_-])/.test(explicit);
    const hasExplicitLight = /(^|[\s"'=:;,_-])light($|[\s"'=:;,_-])/.test(explicit);
    if (hasExplicitDark) {
      return true;
    }
    if (hasExplicitLight) {
      return false;
    }

    const schemes = String(colorScheme || "").toLowerCase().match(/\b(?:dark|light)\b/g) || [];
    if (schemes.length === 1) {
      return schemes[0] === "dark";
    }
    return Boolean(prefersDark);
  }

  function getOverride(value, overrides, includeRoot = true) {
    const keys = getTagKeys(value);
    const mapping = overrides && typeof overrides === "object" ? overrides : {};
    const candidates = [keys.full, `#${keys.full}`];
    if (includeRoot && keys.root && keys.root !== keys.full) {
      candidates.push(keys.root, `#${keys.root}`);
    }

    for (const key of candidates) {
      if (key && Object.prototype.hasOwnProperty.call(mapping, key)) {
        return mapping[key];
      }
    }

    return null;
  }

  function getDescendantOverride(value, overrides) {
    const full = getTagKeys(value).full;
    const mapping = overrides && typeof overrides === "object" ? overrides : {};
    const matchingTag = Object.keys(mapping)
      .map(normalizeTag)
      .filter(Boolean)
      .sort((left, right) => right.length - left.length)
      .find((tag) => full === tag || full.startsWith(`${tag}/`));

    return matchingTag ? getOverride(matchingTag, mapping, false) : null;
  }

  function resolveTagAppearance(value, overrides, fallbackToAuto = true) {
    // 两种模式都优先使用完整标签或最近的显式父标签规则。
    // 只有自动模式在完全找不到显式规则时才生成稳定颜色。
    const override = getDescendantOverride(value, overrides);
    const requested = typeof override === "string" ? override.trim().toLowerCase() : "";

    if (isHexColor(requested)) {
      return getCustomAppearance(requested);
    }

    if (!PALETTE[requested] && !fallbackToAuto) {
      return null;
    }

    const paletteName = PALETTE[requested] ? requested : getAutoPaletteName(value);
    const palette = PALETTE[paletteName];
    return {
      paletteName,
      light: palette.light,
      dark: palette.dark
    };
  }

  function sanitizeSettings(value) {
    const source = value && typeof value === "object" ? value : {};
    const isLegacySettings = source.settingsVersion !== DEFAULT_SETTINGS.settingsVersion;
    const defaults = cloneDefaultSettings();
    if (!isLegacySettings) {
      defaults.overrides = {};
    }
    // 旧版本默认会给所有标签自动配色。升级到白名单方案时，不沿用旧的
    // 覆盖规则，以免历史规则意外让额外标签继续着色。
    if (!isLegacySettings) {
      const overrides = source.overrides && typeof source.overrides === "object" ? source.overrides : {};

      for (const [key, color] of Object.entries(overrides)) {
        const normalizedKey = normalizeTag(key);
        const normalizedColor = typeof color === "string" ? color.trim().toLowerCase() : "";
        if (normalizedKey && (PALETTE[normalizedColor] || isHexColor(normalizedColor))) {
          defaults.overrides[normalizedKey] = normalizedColor;
        }
      }
    }

    return {
      settingsVersion: DEFAULT_SETTINGS.settingsVersion,
      enabled: source.enabled !== false,
      contentEnabled: source.contentEnabled !== false,
      sidebarEnabled: source.sidebarEnabled !== false,
      colorMode: source.colorMode === "automatic" ? "automatic" : "manual",
      overrides: defaults.overrides
    };
  }

  function paletteEntries() {
    return PALETTE_NAMES.map((name) => ({ name, label: PALETTE[name].label }));
  }

  return Object.freeze({
    DEFAULT_SETTINGS,
    DEFAULT_TAG_COLORS,
    PALETTE,
    PALETTE_NAMES,
    cloneDefaultSettings,
    normalizeTag,
    stripSidebarCount,
    getTagKeys,
    hashString,
    getAutoPaletteName,
    isHexColor,
    getRelativeLuminance,
    getContrastRatio,
    ensureReadableText,
    resolveDarkTheme,
    getDescendantOverride,
    resolveTagAppearance,
    sanitizeSettings,
    paletteEntries
  });
});

(function exposeSettingsTools(root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.FlomoSettingsTools = api;
  }
})(typeof globalThis === "undefined" ? this : globalThis, function createSettingsTools() {
  "use strict";

  const BACKUP_FORMAT = "flomo-color-tags-backup";
  const BACKUP_FORMAT_VERSION = 1;

  function buildRuleHierarchy(overrides) {
    const mapping = overrides && typeof overrides === "object" ? overrides : {};
    const paths = new Set();
    for (const tag of Object.keys(mapping)) {
      const segments = tag.split("/").filter(Boolean);
      for (let index = 1; index <= segments.length; index += 1) {
        paths.add(segments.slice(0, index).join("/"));
      }
    }

    return Array.from(paths)
      .sort((left, right) => left.localeCompare(right, "zh-Hans-CN"))
      .map((tag) => {
        const explicit = Object.prototype.hasOwnProperty.call(mapping, tag);
        const segments = tag.split("/");
        let sourceTag = null;
        if (!explicit) {
          for (let index = segments.length - 1; index > 0; index -= 1) {
            const candidate = segments.slice(0, index).join("/");
            if (Object.prototype.hasOwnProperty.call(mapping, candidate)) {
              sourceTag = candidate;
              break;
            }
          }
        }
        return {
          tag,
          depth: segments.length - 1,
          explicit,
          sourceTag,
          color: explicit ? mapping[tag] : sourceTag ? mapping[sourceTag] : null
        };
      });
  }

  function filterRuleRows(rows, filters, colors) {
    const query = String(filters.query || "").trim().toLocaleLowerCase();
    const color = String(filters.color || "").trim().toLowerCase();
    const customOnly = filters.customOnly === true;
    return rows.filter((row) => {
      if (query && !row.tag.toLocaleLowerCase().includes(query)) {
        return false;
      }
      if (color && row.color !== color) {
        return false;
      }
      if (customOnly && !colors.isHexColor(row.color)) {
        return false;
      }
      return true;
    });
  }

  function parseBatchRules(text, existingOverrides, colors) {
    const existing = existingOverrides && typeof existingOverrides === "object"
      ? existingOverrides
      : {};
    const entries = [];
    const errors = [];
    const seen = new Set();
    let duplicates = 0;
    let conflicts = 0;

    String(text || "").split(/\r?\n/).forEach((line, index) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return;
      }
      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex < 1) {
        errors.push({ line: index + 1, text: trimmed, reason: "缺少“标签 = 颜色”分隔符" });
        return;
      }
      const tag = colors.normalizeTag(trimmed.slice(0, separatorIndex));
      const color = trimmed.slice(separatorIndex + 1).trim().toLowerCase();
      if (!tag) {
        errors.push({ line: index + 1, text: trimmed, reason: "标签名无效" });
        return;
      }
      if (!colors.PALETTE[color] && !colors.isHexColor(color)) {
        errors.push({ line: index + 1, text: trimmed, reason: "颜色无效" });
        return;
      }
      if (seen.has(tag)) {
        duplicates += 1;
        errors.push({ line: index + 1, text: trimmed, reason: "粘贴内容中标签重复" });
        return;
      }
      seen.add(tag);
      const conflict = Object.prototype.hasOwnProperty.call(existing, tag);
      if (conflict) {
        conflicts += 1;
      }
      entries.push({ line: index + 1, tag, color, conflict });
    });

    return Object.freeze({
      entries,
      errors,
      valid: entries.length,
      invalid: errors.length,
      duplicates,
      conflicts
    });
  }

  function applyBatchRules(existingOverrides, analysis, overwrite = false) {
    const merged = { ...(existingOverrides || {}) };
    let added = 0;
    let preserved = 0;
    let overwritten = 0;
    for (const entry of analysis.entries || []) {
      if (entry.conflict && !overwrite) {
        preserved += 1;
        continue;
      }
      if (entry.conflict) {
        if (merged[entry.tag] !== entry.color) {
          overwritten += 1;
        } else {
          preserved += 1;
        }
      } else {
        added += 1;
      }
      merged[entry.tag] = entry.color;
    }
    return Object.freeze({ overrides: merged, added, preserved, overwritten });
  }

  function createBackup(settings, extensionVersion, exportedAt = new Date()) {
    return {
      format: BACKUP_FORMAT,
      formatVersion: BACKUP_FORMAT_VERSION,
      extensionVersion,
      exportedAt: exportedAt.toISOString(),
      settings
    };
  }

  function createBackupFilename(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `flomo-color-tags-backup-${year}-${month}-${day}.json`;
  }

  function parseBackupPayload(payload, colors) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("备份内容必须是 JSON 对象");
    }

    let sourceSettings;
    let format;
    if (payload.format === BACKUP_FORMAT) {
      if (payload.formatVersion !== BACKUP_FORMAT_VERSION || !payload.settings) {
        throw new Error("不支持的备份格式版本");
      }
      sourceSettings = payload.settings;
      format = "backup";
    } else if (payload.settings && typeof payload.settings === "object") {
      sourceSettings = payload.settings;
      format = "legacy-wrapper";
    } else {
      sourceSettings = payload;
      format = "legacy-settings";
    }

    if (!sourceSettings || typeof sourceSettings !== "object" || Array.isArray(sourceSettings)) {
      throw new Error("备份中缺少有效设置");
    }
    const rawOverrides = sourceSettings.overrides;
    if (!rawOverrides || typeof rawOverrides !== "object" || Array.isArray(rawOverrides)) {
      throw new Error("备份中缺少颜色规则");
    }

    const overrides = {};
    let validRules = 0;
    let duplicateRules = 0;
    let invalidRules = 0;
    for (const [rawTag, rawColor] of Object.entries(rawOverrides)) {
      const tag = colors.normalizeTag(rawTag);
      const color = typeof rawColor === "string" ? rawColor.trim().toLowerCase() : "";
      if (!tag || (!colors.PALETTE[color] && !colors.isHexColor(color))) {
        invalidRules += 1;
        continue;
      }
      if (Object.prototype.hasOwnProperty.call(overrides, tag)) {
        duplicateRules += 1;
        continue;
      }
      overrides[tag] = color;
      validRules += 1;
    }

    const settings = colors.sanitizeSettings({
      ...sourceSettings,
      settingsVersion: colors.DEFAULT_SETTINGS.settingsVersion,
      overrides
    });
    return Object.freeze({
      format,
      settings,
      stats: Object.freeze({ validRules, duplicateRules, invalidRules })
    });
  }

  return Object.freeze({
    BACKUP_FORMAT,
    BACKUP_FORMAT_VERSION,
    buildRuleHierarchy,
    filterRuleRows,
    parseBatchRules,
    applyBatchRules,
    createBackup,
    createBackupFilename,
    parseBackupPayload
  });
});

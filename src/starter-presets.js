(function exposeStarterPresets(root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.FlomoStarterPresets = api;
  }
})(typeof globalThis === "undefined" ? this : globalThis, function createStarterPresets() {
  "use strict";

  const STARTER_CATEGORIES = Object.freeze([
    Object.freeze({ id: "work", label: "工作", zh: "工作", en: "Work", color: "indigo", core: true }),
    Object.freeze({ id: "personal", label: "个人", zh: "个人", en: "Personal", color: "jade", core: true }),
    Object.freeze({ id: "interests", label: "兴趣", zh: "兴趣", en: "Interests", color: "amber", core: true }),
    Object.freeze({ id: "learning", label: "学习", zh: "学习", en: "Learning", color: "sky", core: true }),
    Object.freeze({ id: "ideas", label: "灵感", zh: "灵感", en: "Ideas", color: "violet", core: true }),
    Object.freeze({ id: "life", label: "生活", zh: "生活", en: "Life", color: "rose", core: true }),
    Object.freeze({ id: "projects", label: "项目", zh: "项目", en: "Projects", color: "orange", core: false }),
    Object.freeze({ id: "reading", label: "阅读", zh: "阅读", en: "Reading", color: "slate", core: false }),
    Object.freeze({ id: "health", label: "健康", zh: "健康", en: "Health", color: "teal", core: false }),
    Object.freeze({ id: "questions", label: "问题", zh: "问题", en: "Questions", color: "coral", core: false })
  ]);

  function createTemplateRows(languageMode = "mixed") {
    const languages = languageMode === "zh"
      ? ["zh"]
      : languageMode === "en"
        ? ["en"]
        : ["zh", "en"];

    return STARTER_CATEGORIES.flatMap((category) => languages.map((language) => ({
      id: `${category.id}-${language}`,
      category: category.label,
      language,
      selected: category.core,
      tag: category[language],
      color: category.color
    })));
  }

  function analyzeTemplateMerge(existingOverrides, rows, options = {}) {
    const colors = options.colors;
    const overwrite = options.overwrite === true;
    const existing = existingOverrides && typeof existingOverrides === "object"
      ? existingOverrides
      : {};
    const merged = { ...existing };
    const seen = new Set();
    let added = 0;
    let preserved = 0;
    let conflicts = 0;
    let overwritten = 0;
    let invalid = 0;
    let duplicates = 0;

    for (const row of Array.isArray(rows) ? rows : []) {
      if (!row || row.selected === false) {
        continue;
      }
      const tag = colors.normalizeTag(row.tag);
      const color = typeof row.color === "string" ? row.color.trim().toLowerCase() : "";
      if (!tag || (!colors.PALETTE[color] && !colors.isHexColor(color))) {
        invalid += 1;
        continue;
      }
      if (seen.has(tag)) {
        duplicates += 1;
        continue;
      }
      seen.add(tag);

      if (Object.prototype.hasOwnProperty.call(existing, tag)) {
        conflicts += 1;
        if (overwrite) {
          if (merged[tag] !== color) {
            overwritten += 1;
          } else {
            preserved += 1;
          }
          merged[tag] = color;
        } else {
          preserved += 1;
        }
        continue;
      }

      merged[tag] = color;
      added += 1;
    }

    return Object.freeze({
      overrides: merged,
      added,
      preserved,
      conflicts,
      overwritten,
      invalid,
      duplicates
    });
  }

  function createTemplateUndo(previousOverrides, appliedOverrides) {
    const previous = previousOverrides && typeof previousOverrides === "object"
      ? previousOverrides
      : {};
    const applied = appliedOverrides && typeof appliedOverrides === "object"
      ? appliedOverrides
      : {};
    const changes = [];
    const tags = new Set([...Object.keys(previous), ...Object.keys(applied)]);

    for (const tag of tags) {
      const hadPrevious = Object.prototype.hasOwnProperty.call(previous, tag);
      const hasApplied = Object.prototype.hasOwnProperty.call(applied, tag);
      const previousValue = previous[tag];
      const appliedValue = applied[tag];
      if (hadPrevious === hasApplied && previousValue === appliedValue) {
        continue;
      }
      changes.push(Object.freeze({
        tag,
        hadPrevious,
        previousValue,
        hasApplied,
        appliedValue
      }));
    }

    return Object.freeze(changes);
  }

  function applyTemplateUndo(currentOverrides, changes) {
    const overrides = { ...(currentOverrides || {}) };
    let reverted = 0;
    let preserved = 0;

    for (const change of Array.isArray(changes) ? changes : []) {
      const hasCurrent = Object.prototype.hasOwnProperty.call(overrides, change.tag);
      const stillMatchesTemplate = hasCurrent === change.hasApplied
        && (!hasCurrent || overrides[change.tag] === change.appliedValue);
      if (!stillMatchesTemplate) {
        preserved += 1;
        continue;
      }
      if (change.hadPrevious) {
        overrides[change.tag] = change.previousValue;
      } else {
        delete overrides[change.tag];
      }
      reverted += 1;
    }

    return Object.freeze({ overrides, reverted, preserved });
  }

  return Object.freeze({
    STARTER_CATEGORIES,
    createTemplateRows,
    analyzeTemplateMerge,
    createTemplateUndo,
    applyTemplateUndo
  });
});

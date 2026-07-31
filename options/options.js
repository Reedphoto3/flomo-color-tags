(function runOptionsPage() {
  "use strict";

  const colors = globalThis.FlomoColorTags;
  const presets = globalThis.FlomoStarterPresets;
  const settingsTools = globalThis.FlomoSettingsTools;
  const SETTINGS_KEY = "settings";
  const elements = {
    enabled: document.querySelector("#enabled"),
    contentEnabled: document.querySelector("#content-enabled"),
    sidebarEnabled: document.querySelector("#sidebar-enabled"),
    pinnedTagsAutoColor: document.querySelector("#pinned-tags-auto-color"),
    colorMode: document.querySelector("#color-mode"),
    quickTemplate: document.querySelector("#quick-template"),
    quickPinned: document.querySelector("#quick-pinned"),
    pinnedColoringPanel: document.querySelector("#pinned-coloring-panel"),
    templatePanel: document.querySelector("#template-panel"),
    templateLanguage: document.querySelector("#template-language"),
    templateRows: document.querySelector("#template-rows"),
    templateOverwrite: document.querySelector("#template-overwrite"),
    templateSummary: document.querySelector("#template-summary"),
    applyTemplate: document.querySelector("#apply-template"),
    undoTemplate: document.querySelector("#undo-template"),
    ruleForm: document.querySelector("#rule-form"),
    tagName: document.querySelector("#tag-name"),
    paletteName: document.querySelector("#palette-name"),
    customColorWrap: document.querySelector("#custom-color-wrap"),
    customColor: document.querySelector("#custom-color"),
    customColorCode: document.querySelector("#custom-color-code"),
    coloredTags: document.querySelector("#colored-tags"),
    ruleSearch: document.querySelector("#rule-search"),
    ruleColorFilter: document.querySelector("#rule-color-filter"),
    ruleCustomOnly: document.querySelector("#rule-custom-only"),
    clearRuleFilters: document.querySelector("#clear-rule-filters"),
    batchRules: document.querySelector("#batch-rules"),
    batchOverwrite: document.querySelector("#batch-overwrite"),
    previewBatch: document.querySelector("#preview-batch"),
    applyBatch: document.querySelector("#apply-batch"),
    batchPreview: document.querySelector("#batch-preview"),
    exportSettings: document.querySelector("#export-settings"),
    importSettings: document.querySelector("#import-settings"),
    resetSettings: document.querySelector("#reset-settings"),
    status: document.querySelector("#status")
  };

  let settings = colors.cloneDefaultSettings();
  let templateRows = presets.createTemplateRows("mixed");
  let templateUndoChanges = null;
  let batchAnalysis = null;

  function setStatus(message, isError) {
    elements.status.textContent = message;
    elements.status.classList.toggle("is-error", Boolean(isError));
    elements.status.setAttribute("role", isError ? "alert" : "status");
  }

  function clearTemplateUndo() {
    templateUndoChanges = null;
    elements.undoTemplate.disabled = true;
  }

  function addPaletteOptions(select, customColor) {
    select.replaceChildren();
    for (const palette of colors.paletteEntries()) {
      const option = document.createElement("option");
      option.value = palette.name;
      option.textContent = palette.label;
      select.append(option);
    }
    if (colors.isHexColor(customColor)) {
      const option = document.createElement("option");
      option.value = customColor;
      option.textContent = customColor.toUpperCase();
      select.append(option);
    }
    const custom = document.createElement("option");
    custom.value = "__custom__";
    custom.textContent = "输入颜色代码…";
    select.append(custom);
  }

  function updateInputs() {
    elements.enabled.checked = settings.enabled;
    elements.contentEnabled.checked = settings.contentEnabled;
    elements.sidebarEnabled.checked = settings.sidebarEnabled;
    elements.pinnedTagsAutoColor.checked = settings.pinnedTagsAutoColor;
    elements.colorMode.value = settings.colorMode;
    elements.quickPinned.textContent = settings.pinnedTagsAutoColor
      ? "已启用固定标签配色"
      : "启用固定标签配色";
  }

  function setCustomColor(value) {
    const normalized = colors.isHexColor(value) ? value.trim().toLowerCase() : "#2563eb";
    const pickerValue = normalized.length === 4
      ? `#${normalized.slice(1).split("").map((part) => part + part).join("")}`
      : normalized;
    elements.customColor.value = pickerValue;
    elements.customColorCode.value = normalized.toUpperCase();
  }

  function getColorAppearance(tag, color) {
    return colors.resolveTagAppearance(tag, { [tag]: color }, false);
  }

  function createColorSwatch(tag, color) {
    const appearance = getColorAppearance(tag, color);
    const swatch = document.createElement("span");
    swatch.className = "color-swatch";
    swatch.style.backgroundColor = appearance.light.background;
    swatch.style.borderColor = appearance.light.border;
    swatch.title = colors.PALETTE[color] ? colors.PALETTE[color].label : color.toUpperCase();
    return swatch;
  }

  function createPaletteSelect(value) {
    const select = document.createElement("select");
    for (const palette of colors.paletteEntries()) {
      const option = document.createElement("option");
      option.value = palette.name;
      option.textContent = palette.label;
      select.append(option);
    }
    select.value = value;
    return select;
  }

  function getTemplateAnalysis() {
    return presets.analyzeTemplateMerge(settings.overrides, templateRows, {
      colors,
      overwrite: elements.templateOverwrite.checked
    });
  }

  function renderTemplateSummary() {
    const analysis = getTemplateAnalysis();
    const parts = [
      `将新增 ${analysis.added} 条`,
      `将保留 ${analysis.preserved} 条已有规则`,
      `有 ${analysis.conflicts} 条同名规则${elements.templateOverwrite.checked ? "将按选择覆盖" : "不会覆盖"}`
    ];
    if (analysis.invalid) {
      parts.push(`无效 ${analysis.invalid} 条`);
    }
    if (analysis.duplicates) {
      parts.push(`重复 ${analysis.duplicates} 条`);
    }
    elements.templateSummary.textContent = parts.join("；");
  }

  function renderTemplateRows() {
    elements.templateRows.replaceChildren();
    for (const row of templateRows) {
      const tableRow = document.createElement("tr");

      const selectedCell = document.createElement("td");
      const selected = document.createElement("input");
      selected.type = "checkbox";
      selected.checked = row.selected;
      selected.setAttribute("aria-label", `使用${row.category}${row.language === "zh" ? "中文" : "英文"}规则`);
      selected.addEventListener("change", () => {
        row.selected = selected.checked;
        renderTemplateSummary();
      });
      selectedCell.append(selected);

      const categoryCell = document.createElement("td");
      categoryCell.textContent = `${row.category} · ${row.language === "zh" ? "中文" : "EN"}`;

      const tagCell = document.createElement("td");
      const tagInput = document.createElement("input");
      tagInput.type = "text";
      tagInput.value = row.tag;
      tagInput.setAttribute("aria-label", `${row.category}标签名`);
      tagInput.addEventListener("input", () => {
        row.tag = tagInput.value;
        renderTemplateSummary();
      });
      tagCell.append(tagInput);

      const colorCell = document.createElement("td");
      const colorSelect = createPaletteSelect(row.color);
      colorSelect.setAttribute("aria-label", `${row.category}颜色`);
      colorSelect.addEventListener("change", () => {
        row.color = colorSelect.value;
        renderTemplateSummary();
      });
      colorCell.append(colorSelect);

      tableRow.append(selectedCell, categoryCell, tagCell, colorCell);
      elements.templateRows.append(tableRow);
    }
    renderTemplateSummary();
  }

  function makeRow(rule) {
    const { tag } = rule;
    const row = document.createElement("tr");
    if (!rule.explicit) {
      row.className = "inherited-rule";
    }
    const tagCell = document.createElement("td");
    const tagLabel = document.createElement("span");
    tagLabel.className = "rule-tag-label";
    tagLabel.style.setProperty("--rule-depth", rule.depth);
    tagLabel.textContent = `#${tag}`;
    const source = document.createElement("small");
    source.className = "rule-source";
    source.textContent = rule.explicit
      ? "单独设置"
      : rule.sourceTag
        ? `继承自 #${rule.sourceTag}`
        : "仅作为层级分组";
    tagCell.append(tagLabel, source);

    const colorCell = document.createElement("td");
    colorCell.className = "color-cell";
    const override = rule.color;
    if (!override) {
      colorCell.textContent = "—";
      const actionCell = document.createElement("td");
      row.append(tagCell, colorCell, actionCell);
      return row;
    }
    colorCell.append(createColorSwatch(tag, override));
    if (!rule.explicit) {
      const inheritedColor = document.createElement("span");
      inheritedColor.textContent = colors.PALETTE[override]
        ? colors.PALETTE[override].label
        : override.toUpperCase();
      colorCell.append(inheritedColor);
      const actionCell = document.createElement("td");
      row.append(tagCell, colorCell, actionCell);
      return row;
    }
    const select = document.createElement("select");
    addPaletteOptions(select, colors.isHexColor(override) ? override : "");
    select.value = override;
    select.addEventListener("change", async () => {
      if (select.value === "__custom__") {
        elements.tagName.value = tag;
        elements.paletteName.value = "__custom__";
        elements.customColorWrap.hidden = false;
        setCustomColor(colors.isHexColor(override) ? override : elements.customColor.value);
        elements.tagName.focus();
        select.value = override;
        setStatus("已将标签带入上方表单，请输入颜色代码后保存。");
        return;
      }
      settings.overrides[tag] = select.value;
      await saveSettings("颜色规则已保存。");
    });
    colorCell.append(select);

    const actionCell = document.createElement("td");
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-rule";
    remove.textContent = "移除";
    remove.addEventListener("click", async () => {
      delete settings.overrides[tag];
      await saveSettings(settings.colorMode === "automatic" ? "已恢复为自动配色。" : "该标签已改为不着色。");
    });
    actionCell.append(remove);
    row.append(tagCell, colorCell, actionCell);
    return row;
  }

  function renderColoredTags() {
    elements.coloredTags.replaceChildren();
    const rows = settingsTools.buildRuleHierarchy(settings.overrides);
    const visibleRows = settingsTools.filterRuleRows(rows, {
      query: elements.ruleSearch.value,
      color: elements.ruleColorFilter.value,
      customOnly: elements.ruleCustomOnly.checked
    }, colors);
    if (visibleRows.length === 0) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 3;
      cell.className = "empty";
      cell.textContent = rows.length
        ? "没有符合当前筛选条件的规则。"
        : "暂时没有单独颜色规则。可以使用入门模板；若只想区分侧栏固定标签，也可开启固定标签自动配色。";
      row.append(cell);
      elements.coloredTags.append(row);
      return;
    }

    for (const rule of visibleRows) {
      elements.coloredTags.append(makeRow(rule));
    }
  }

  function renderBatchPreview() {
    elements.batchPreview.replaceChildren();
    if (!batchAnalysis) {
      return;
    }
    const summary = document.createElement("p");
    summary.textContent = [
      `有效规则：${batchAnalysis.valid}`,
      `同名冲突：${batchAnalysis.conflicts}`,
      `重复规则：${batchAnalysis.duplicates}`,
      `无效规则：${batchAnalysis.invalid}`
    ].join("；");
    elements.batchPreview.append(summary);

    if (batchAnalysis.errors.length) {
      const list = document.createElement("ul");
      for (const error of batchAnalysis.errors) {
        const item = document.createElement("li");
        item.textContent = `第 ${error.line} 行：${error.reason}（${error.text}）`;
        list.append(item);
      }
      elements.batchPreview.append(list);
    }
    elements.applyBatch.disabled = batchAnalysis.valid === 0 || batchAnalysis.invalid > 0;
  }

  async function saveSettings(message) {
    settings = colors.sanitizeSettings(settings);
    await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
    updateInputs();
    renderColoredTags();
    renderTemplateSummary();
    setStatus(message || "设置已保存。");
  }

  async function load() {
    const stored = await chrome.storage.local.get(SETTINGS_KEY);
    settings = colors.sanitizeSettings(stored[SETTINGS_KEY]);
    updateInputs();
    renderColoredTags();
    renderTemplateSummary();
  }

  elements.quickTemplate.addEventListener("click", () => {
    elements.templatePanel.scrollIntoView({ behavior: "smooth", block: "start" });
    elements.templateLanguage.focus({ preventScroll: true });
    setStatus("可选择标签语言、标签名和颜色后再应用模板。");
  });

  elements.quickPinned.addEventListener("click", async () => {
    if (!settings.pinnedTagsAutoColor) {
      settings.pinnedTagsAutoColor = true;
      await saveSettings("已启用固定标签自动配色；刷新 flomo 页面后即可查看。");
    } else {
      setStatus("固定标签自动配色已启用。");
    }
    elements.pinnedColoringPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    elements.pinnedTagsAutoColor.focus({ preventScroll: true });
  });

  elements.paletteName.addEventListener("change", () => {
    elements.customColorWrap.hidden = elements.paletteName.value !== "__custom__";
  });

  elements.customColor.addEventListener("input", () => {
    elements.customColorCode.value = elements.customColor.value.toUpperCase();
  });

  elements.customColorCode.addEventListener("input", () => {
    const value = elements.customColorCode.value.trim();
    if (colors.isHexColor(value)) {
      const pickerValue = value.length === 4
        ? `#${value.slice(1).split("").map((part) => part + part).join("")}`
        : value;
      elements.customColor.value = pickerValue;
    }
  });

  for (const checkbox of [elements.enabled, elements.contentEnabled, elements.sidebarEnabled]) {
    checkbox.addEventListener("change", async () => {
      settings.enabled = elements.enabled.checked;
      settings.contentEnabled = elements.contentEnabled.checked;
      settings.sidebarEnabled = elements.sidebarEnabled.checked;
      await saveSettings("显示范围已保存。");
    });
  }

  elements.pinnedTagsAutoColor.addEventListener("change", async () => {
    settings.pinnedTagsAutoColor = elements.pinnedTagsAutoColor.checked;
    await saveSettings(settings.pinnedTagsAutoColor
      ? "已启用固定标签自动配色；显式颜色规则仍然优先。"
      : "已关闭固定标签自动配色；未设置规则的固定标签将不再着色。"
    );
  });

  elements.colorMode.addEventListener("change", async () => {
    settings.colorMode = elements.colorMode.value;
    await saveSettings(settings.colorMode === "manual" ? "已改为仅给指定标签着色。" : "已改为全部标签自动配色。");
  });

  elements.templateLanguage.addEventListener("change", () => {
    templateRows = presets.createTemplateRows(elements.templateLanguage.value);
    renderTemplateRows();
  });

  elements.templateOverwrite.addEventListener("change", renderTemplateSummary);

  elements.applyTemplate.addEventListener("click", async () => {
    const analysis = getTemplateAnalysis();
    if (analysis.invalid) {
      setStatus("模板中仍有无效标签名或颜色，请先修正。", true);
      return;
    }
    templateUndoChanges = presets.createTemplateUndo(
      settings.overrides,
      analysis.overrides
    );
    settings.overrides = analysis.overrides;
    elements.undoTemplate.disabled = templateUndoChanges.length === 0;
    await saveSettings(
      `模板已应用：新增 ${analysis.added} 条，保留 ${analysis.preserved} 条，覆盖 ${analysis.overwritten} 条。`
    );
  });

  elements.undoTemplate.addEventListener("click", async () => {
    if (!templateUndoChanges) {
      return;
    }
    const result = presets.applyTemplateUndo(settings.overrides, templateUndoChanges);
    settings.overrides = result.overrides;
    clearTemplateUndo();
    await saveSettings(
      `已撤销模板影响的 ${result.reverted} 条规则；保留模板应用后的 ${result.preserved} 条同名修改。`
    );
  });

  for (const control of [elements.ruleSearch, elements.ruleColorFilter, elements.ruleCustomOnly]) {
    control.addEventListener("input", renderColoredTags);
    control.addEventListener("change", renderColoredTags);
  }

  elements.clearRuleFilters.addEventListener("click", () => {
    elements.ruleSearch.value = "";
    elements.ruleColorFilter.value = "";
    elements.ruleCustomOnly.checked = false;
    renderColoredTags();
  });

  elements.batchRules.addEventListener("input", () => {
    batchAnalysis = null;
    elements.applyBatch.disabled = true;
    elements.batchPreview.replaceChildren();
  });

  elements.previewBatch.addEventListener("click", () => {
    batchAnalysis = settingsTools.parseBatchRules(
      elements.batchRules.value,
      settings.overrides,
      colors
    );
    renderBatchPreview();
  });

  elements.applyBatch.addEventListener("click", async () => {
    // 点击确认时重新解析，避免预览后新增的同名规则绕过“不覆盖”保护。
    batchAnalysis = settingsTools.parseBatchRules(
      elements.batchRules.value,
      settings.overrides,
      colors
    );
    renderBatchPreview();
    if (!batchAnalysis || batchAnalysis.invalid) {
      return;
    }
    const result = settingsTools.applyBatchRules(
      settings.overrides,
      batchAnalysis,
      elements.batchOverwrite.checked
    );
    settings.overrides = result.overrides;
    await saveSettings(
      `批量规则已添加：新增 ${result.added} 条，保留 ${result.preserved} 条，覆盖 ${result.overwritten} 条。`
    );
    batchAnalysis = null;
    elements.batchRules.value = "";
    elements.applyBatch.disabled = true;
    elements.batchPreview.replaceChildren();
  });

  elements.ruleForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const tag = colors.normalizeTag(elements.tagName.value);
    if (!tag) {
      setStatus("请输入有效的标签名称。", true);
      return;
    }

    const requestedColor = elements.paletteName.value === "__custom__"
      ? elements.customColorCode.value.trim().toLowerCase()
      : elements.paletteName.value;
    if (!requestedColor || (!colors.PALETTE[requestedColor] && !colors.isHexColor(requestedColor))) {
      setStatus("请选择一种颜色。", true);
      return;
    }

    settings.overrides[tag] = requestedColor;
    elements.tagName.value = "";
    elements.paletteName.value = colors.PALETTE_NAMES[0];
    elements.customColorWrap.hidden = true;
    await saveSettings("颜色规则已保存。");
  });

  elements.exportSettings.addEventListener("click", () => {
    const now = new Date();
    const extensionVersion = chrome.runtime.getManifest().version;
    const payload = JSON.stringify(
      settingsTools.createBackup(settings, extensionVersion, now),
      null,
      2
    );
    const file = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = settingsTools.createBackupFilename(now);
    link.click();
    globalThis.setTimeout(() => URL.revokeObjectURL(url), 0);
    setStatus("配置备份已下载。");
  });

  elements.importSettings.addEventListener("change", async () => {
    const [file] = elements.importSettings.files;
    if (!file) {
      return;
    }
    try {
      const parsed = JSON.parse(await file.text());
      const restored = settingsTools.parseBackupPayload(parsed, colors);
      const { validRules, duplicateRules, invalidRules } = restored.stats;
      const confirmed = globalThis.confirm(
        `恢复配置预览：\n有效规则：${validRules}\n重复规则：${duplicateRules}\n无效规则：${invalidRules}\n\n确认用该配置替换当前设置？`
      );
      if (!confirmed) {
        setStatus("已取消恢复，当前设置没有变化。");
        return;
      }
      clearTemplateUndo();
      settings = restored.settings;
      await saveSettings(
        `配置已恢复：有效 ${validRules} 条，重复 ${duplicateRules} 条，无效 ${invalidRules} 条。`
      );
    } catch (error) {
      setStatus(`无法导入设置：${error.message}`, true);
    } finally {
      elements.importSettings.value = "";
    }
  });

  elements.resetSettings.addEventListener("click", async () => {
    if (!globalThis.confirm("恢复默认显示和白名单配色？现有自定义颜色规则会被删除。")) {
      return;
    }
    clearTemplateUndo();
    settings = colors.cloneDefaultSettings();
    await saveSettings("已恢复默认设置。");
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") {
      return;
    }
    if (changes[SETTINGS_KEY]) {
      load().catch((error) => setStatus(`更新设置失败：${error.message}`, true));
    }
  });

  addPaletteOptions(elements.paletteName, "");
  elements.paletteName.value = colors.PALETTE_NAMES[0];
  for (const palette of colors.paletteEntries()) {
    const option = document.createElement("option");
    option.value = palette.name;
    option.textContent = palette.label;
    elements.ruleColorFilter.append(option);
  }
  renderTemplateRows();
  load().catch((error) => setStatus(`加载设置失败：${error.message}`, true));
})();

(function runOptionsPage() {
  "use strict";

  const colors = globalThis.FlomoColorTags;
  const presets = globalThis.FlomoStarterPresets;
  const SETTINGS_KEY = "settings";
  const elements = {
    enabled: document.querySelector("#enabled"),
    contentEnabled: document.querySelector("#content-enabled"),
    sidebarEnabled: document.querySelector("#sidebar-enabled"),
    colorMode: document.querySelector("#color-mode"),
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
    exportSettings: document.querySelector("#export-settings"),
    importSettings: document.querySelector("#import-settings"),
    resetSettings: document.querySelector("#reset-settings"),
    status: document.querySelector("#status")
  };

  let settings = colors.cloneDefaultSettings();
  let templateRows = presets.createTemplateRows("mixed");
  let templateUndoSnapshot = null;

  function setStatus(message, isError) {
    elements.status.textContent = message;
    elements.status.style.color = isError ? "#b42318" : "";
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
    elements.colorMode.value = settings.colorMode;
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

  function makeRow(tag) {
    const row = document.createElement("tr");
    const tagCell = document.createElement("td");
    tagCell.textContent = `#${tag}`;

    const colorCell = document.createElement("td");
    colorCell.className = "color-cell";
    const override = settings.overrides[tag];
    colorCell.append(createColorSwatch(tag, override));
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
    const visibleTags = Object.keys(settings.overrides)
      .sort((left, right) => left.localeCompare(right, "zh-Hans-CN"));
    if (visibleTags.length === 0) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 3;
      cell.className = "empty";
      cell.textContent = "暂时没有已着色标签。请在上方输入标签名并保存颜色。";
      row.append(cell);
      elements.coloredTags.append(row);
      return;
    }

    for (const tag of visibleTags) {
      elements.coloredTags.append(makeRow(tag));
    }
  }

  async function saveSettings(message) {
    settings = colors.sanitizeSettings(settings);
    await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
    updateInputs();
    renderColoredTags();
    setStatus(message || "设置已保存。");
  }

  async function load() {
    const stored = await chrome.storage.local.get(SETTINGS_KEY);
    settings = colors.sanitizeSettings(stored[SETTINGS_KEY]);
    updateInputs();
    renderColoredTags();
  }

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
    templateUndoSnapshot = structuredClone(settings);
    settings.overrides = analysis.overrides;
    elements.undoTemplate.disabled = false;
    await saveSettings(
      `模板已应用：新增 ${analysis.added} 条，保留 ${analysis.preserved} 条，覆盖 ${analysis.overwritten} 条。`
    );
    renderTemplateSummary();
  });

  elements.undoTemplate.addEventListener("click", async () => {
    if (!templateUndoSnapshot) {
      return;
    }
    settings = templateUndoSnapshot;
    templateUndoSnapshot = null;
    elements.undoTemplate.disabled = true;
    await saveSettings("已撤销本次模板应用。");
    renderTemplateSummary();
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
    const payload = JSON.stringify({ version: 1, settings }, null, 2);
    const file = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = "flomo-color-tags-settings.json";
    link.click();
    globalThis.setTimeout(() => URL.revokeObjectURL(url), 0);
    setStatus("设置已导出。");
  });

  elements.importSettings.addEventListener("change", async () => {
    const [file] = elements.importSettings.files;
    if (!file) {
      return;
    }
    try {
      const parsed = JSON.parse(await file.text());
      settings = colors.sanitizeSettings(parsed.settings || parsed);
      await saveSettings("设置已导入。");
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
  renderTemplateRows();
  load().catch((error) => setStatus(`加载设置失败：${error.message}`, true));
})();

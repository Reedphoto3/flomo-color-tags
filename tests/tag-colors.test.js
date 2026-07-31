const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { parseHTML } = require("linkedom");
const colors = require("../src/tag-colors.js");
const detection = require("../src/tag-detection.js");
const rendering = require("../src/tag-rendering.js");
const presets = require("../src/starter-presets.js");
const settingsTools = require("../src/settings-tools.js");

const FIXTURE_DIRECTORY = path.join(__dirname, "fixtures");

function loadFixture(name) {
  return parseHTML(fs.readFileSync(path.join(FIXTURE_DIRECTORY, name), "utf8"));
}

function createTestRenderer(document, overrides = {}, extra = {}) {
  const settings = {
    ...colors.cloneDefaultSettings(),
    overrides,
    ...extra.settings
  };
  return rendering.createRenderer({
    colors,
    detection,
    document,
    getSettings: () => settings,
    getComputedStyle: () => ({ colorScheme: extra.colorScheme || "" }),
    matchMedia: () => ({ matches: Boolean(extra.prefersDark) })
  });
}

test("规范化标签会去除 # 和多余空白，但保留数字结尾", () => {
  assert.equal(colors.normalizeTag("  #示例主题 / 子项  "), "示例主题/子项");
  assert.equal(colors.normalizeTag("GPT 5"), "GPT 5");
  assert.equal(colors.normalizeTag("iPhone 17"), "iPhone 17");
  assert.equal(colors.normalizeTag("计划 2026"), "计划 2026");
  assert.equal(colors.normalizeTag("项目 2"), "项目 2");
  assert.equal(colors.normalizeTag(""), "");
});

test("侧边栏只移除具有明确计数语义的后缀", () => {
  assert.equal(colors.stripSidebarCount("#示例主题 (17)"), "#示例主题");
  assert.equal(colors.stripSidebarCount("示例主题 17 条"), "示例主题");
  assert.equal(colors.stripSidebarCount("示例主题 2 memos"), "示例主题");
  assert.equal(colors.stripSidebarCount("GPT 5"), "GPT 5");
  assert.equal(colors.stripSidebarCount("计划 2026"), "计划 2026");
});

test("多级标签默认按一级标签稳定配色", () => {
  const first = colors.resolveTagAppearance("#示例根目录/项目A", {});
  const second = colors.resolveTagAppearance("示例根目录/项目B", {});
  const third = colors.resolveTagAppearance("示例根目录/项目A", {});

  assert.equal(first.paletteName, second.paletteName);
  assert.equal(first.paletteName, third.paletteName);
});

test("完整标签规则优先于一级标签规则", () => {
  const overrides = { "示例根目录": "sky", "示例根目录/紧急": "coral" };
  assert.equal(colors.resolveTagAppearance("示例根目录/普通", overrides).paletteName, "sky");
  assert.equal(colors.resolveTagAppearance("示例根目录/紧急", overrides).paletteName, "coral");
});

test("自动模式优先继承最近的中间层父标签规则", () => {
  assert.equal(
    colors.resolveTagAppearance(
      "工作/项目/任务",
      { "工作": "sky", "工作/项目": "rose" },
      true
    ).paletteName,
    "rose"
  );
});

test("白名单模式不会为未指定标签生成自动颜色", () => {
  assert.equal(colors.resolveTagAppearance("未着色示例", {}, false), null);
  assert.equal(colors.resolveTagAppearance("已着色示例", { "已着色示例": "indigo" }, false).paletteName, "indigo");
});

test("白名单标签会将颜色延伸到下属标签，完整子标签规则优先", () => {
  const overrides = { "示例根目录": "amber", "示例根目录/笔记": "rose", "示例根目录/笔记/方法": "sky", "示例清单": "amber" };
  assert.equal(colors.resolveTagAppearance("示例根目录/课程", overrides, false).paletteName, "amber");
  assert.equal(colors.resolveTagAppearance("示例根目录/笔记/整理", overrides, false).paletteName, "rose");
  assert.equal(colors.resolveTagAppearance("示例根目录/笔记/方法", overrides, false).paletteName, "sky");
  assert.equal(colors.resolveTagAppearance("示例清单/收集", overrides, false).paletteName, "amber");
  assert.equal(colors.resolveTagAppearance("示例根目录/摘录", overrides, false).paletteName, "amber");
});

test("自定义十六进制颜色会生成可用于深浅主题的颜色组", () => {
  const appearance = colors.resolveTagAppearance("示例灵感", { "示例灵感": "#8b5cf6" });
  assert.equal(appearance.paletteName, "custom");
  assert.match(appearance.light.background, /^#[0-9a-f]{6}$/i);
  assert.match(appearance.dark.text, /^#[0-9a-f]{6}$/i);
});

test("极浅和极深自定义颜色在深浅主题下都有足够文字对比度", () => {
  for (const color of ["#ffffff", "#ffff00", "#39ff14", "#000000", "#8b5cf6"]) {
    const appearance = colors.resolveTagAppearance("对比测试", { "对比测试": color }, false);
    for (const theme of ["light", "dark"]) {
      const token = appearance[theme];
      assert.ok(
        colors.getContrastRatio(token.text, token.background) >= 4.5,
        `${color} ${theme} 的文字对比度应达到 WCAG AA`
      );
    }
  }
});

test("主题判断优先尊重页面显式 dark 和 light", () => {
  assert.equal(colors.resolveDarkTheme("theme-dark", "light", false), true);
  assert.equal(colors.resolveDarkTheme("theme-light", "dark", true), false);
  assert.equal(colors.resolveDarkTheme("", "dark", false), true);
  assert.equal(colors.resolveDarkTheme("", "light", true), false);
  assert.equal(colors.resolveDarkTheme("", "light dark", true), true);
  assert.equal(colors.resolveDarkTheme("", "", false), false);
});

test("设置清洗会移除无效规则并保留合法规则", () => {
  const settings = colors.sanitizeSettings({
    enabled: false,
    settingsVersion: 10,
    pinnedTagsAutoColor: true,
    colorMode: "manual",
    overrides: { "#示例根目录": "jade", "无效示例": "rainbow", "示例灵感": "#ff00aa" }
  });
  assert.equal(settings.settingsVersion, 10);
  assert.equal(settings.enabled, false);
  assert.equal(settings.pinnedTagsAutoColor, true);
  assert.equal(settings.colorMode, "manual");
  assert.deepEqual(settings.overrides, { "示例根目录": "jade", "示例灵感": "#ff00aa" });
});

test("旧版设置会迁移为不含个人标签的空白白名单", () => {
  const settings = colors.sanitizeSettings({ settingsVersion: 8, enabled: true, overrides: { "示例项目": "jade", "示例摘录": "sky", "示例主题": "violet" } });
  assert.equal(settings.settingsVersion, 10);
  assert.equal(settings.colorMode, "manual");
  assert.equal(settings.pinnedTagsAutoColor, false);
  assert.deepEqual(settings.overrides, {});
});

test("settingsVersion 9 升级到 10 会保留用户规则并补充新默认值", () => {
  const settings = colors.sanitizeSettings({
    settingsVersion: 9,
    enabled: true,
    overrides: { "示例根目录": "jade" }
  });
  assert.equal(settings.settingsVersion, 10);
  assert.equal(settings.pinnedTagsAutoColor, false);
  assert.deepEqual(settings.overrides, { "示例根目录": "jade" });
});

test("DOM fixture 能识别侧栏、嵌套、正文和搜索结果标签", () => {
  const cases = [
    ["sidebar-root-tag.html", ["sidebar-work", "sidebar-gpt"]],
    ["sidebar-nested-tags.html", ["tag-root", "tag-child", "tag-grandchild"]],
    ["content-tag.html", ["content-tag"]],
    ["search-result-tag.html", ["search-tag"]]
  ];

  for (const [fixture, expectedIds] of cases) {
    const { document } = loadFixture(fixture);
    const actualIds = detection.getCandidates(document, document)
      .filter((element) => detection.isLikelyTagElement(element, colors))
      .map((element) => element.id)
      .filter(Boolean)
      .sort();
    assert.deepEqual(actualIds, expectedIds.sort(), fixture);
  }
});

test("标签候选框、普通 tag 字样和多标签父容器不会误染", () => {
  const pickerDocument = loadFixture("tag-picker.html").document;
  assert.equal(
    detection.isLikelyTagElement(pickerDocument.querySelector("#picker-option"), colors),
    false
  );

  const contentDocument = loadFixture("content-tag.html").document;
  assert.equal(
    detection.isLikelyTagElement(contentDocument.querySelector("#tag-cloud-banner"), colors),
    false
  );

  const nestedDocument = loadFixture("sidebar-nested-tags.html").document;
  assert.equal(
    detection.isLikelyTagElement(nestedDocument.querySelector("#expanded-group"), colors),
    false
  );

  const sidebarDocument = loadFixture("sidebar-root-tag.html").document;
  assert.equal(
    detection.isLikelyTagElement(sidebarDocument.querySelector("#sidebar-icon"), colors),
    false
  );
});

test("侧栏 DOM 提取保留数字标签并移除明确数量", () => {
  const { document } = loadFixture("sidebar-root-tag.html");
  assert.equal(
    colors.normalizeTag(detection.getRawTagText(document.querySelector("#sidebar-work"), colors)),
    "工作"
  );
  assert.equal(
    colors.normalizeTag(detection.getRawTagText(document.querySelector("#sidebar-gpt"), colors)),
    "GPT 5"
  );
});

test("固定标签检测只命中置顶区域", () => {
  const pinnedDocument = loadFixture("sidebar-root-tag.html").document;
  assert.equal(detection.isPinnedSidebarTag(pinnedDocument.querySelector("#sidebar-work")), true);

  const nestedDocument = loadFixture("sidebar-nested-tags.html").document;
  assert.equal(detection.isPinnedSidebarTag(nestedDocument.querySelector("#tag-root")), false);

  const contentDocument = loadFixture("content-tag.html").document;
  assert.equal(detection.isPinnedSidebarTag(contentDocument.querySelector("#content-tag")), false);
});

test("渲染层支持动态添加、标签属性改变和旧样式清理", () => {
  const { document } = loadFixture("content-tag.html");
  const renderer = createTestRenderer(document, { "灵感": "violet", "工作": "indigo", "兴趣": "amber" });
  const tag = document.querySelector("#content-tag");
  renderer.processRoot(document);
  assert.equal(tag.dataset.flomoColorTagKey, "灵感");

  tag.setAttribute("data-tag", "工作");
  renderer.processRoot(tag);
  assert.equal(tag.dataset.flomoColorTagKey, "工作");

  tag.setAttribute("data-tag", "兴趣");
  renderer.processRoot(tag);
  assert.equal(tag.dataset.flomoColorTagKey, "兴趣");

  tag.removeAttribute("data-tag");
  tag.removeAttribute("href");
  tag.className = "ordinary-link";
  tag.textContent = "普通节点";
  renderer.processRoot(tag);
  assert.equal(tag.hasAttribute("data-flomo-color-tag"), false);

  const dynamic = document.createElement("a");
  dynamic.id = "dynamic-tag";
  dynamic.setAttribute("data-tag-name", "工作");
  dynamic.setAttribute("href", "/tag/work");
  dynamic.textContent = "#工作";
  document.body.append(dynamic);
  renderer.processRoot(dynamic);
  assert.equal(dynamic.dataset.flomoColorTagKey, "工作");
});

test("节点从正文移动到侧栏后会重新计算显示范围", () => {
  const { document } = loadFixture("content-tag.html");
  const renderer = createTestRenderer(document, { "灵感": "violet" });
  const tag = document.querySelector("#content-tag");
  renderer.processRoot(tag);
  assert.equal(tag.dataset.flomoColorTagScope, "content");

  const sidebar = document.createElement("aside");
  sidebar.className = "app-sidebar";
  document.body.append(sidebar);
  sidebar.append(tag);
  renderer.processRoot(tag);
  assert.equal(tag.dataset.flomoColorTagScope, "sidebar");
});

test("固定标签随机配色默认关闭，开启后稳定着色且显式规则优先", () => {
  const disabledDocument = loadFixture("sidebar-root-tag.html").document;
  const disabledTag = disabledDocument.querySelector("#sidebar-work");
  createTestRenderer(disabledDocument).processRoot(disabledDocument);
  assert.equal(disabledTag.hasAttribute("data-flomo-color-tag"), false);

  const enabledDocument = loadFixture("sidebar-root-tag.html").document;
  const enabledTag = enabledDocument.querySelector("#sidebar-work");
  createTestRenderer(enabledDocument, {}, {
    settings: { colorMode: "manual", pinnedTagsAutoColor: true }
  }).processRoot(enabledDocument);
  assert.equal(enabledTag.dataset.flomoColorTagKey, "工作");
  const firstAppearance = enabledTag.dataset.flomoColorTagAppearance;
  assert.ok(firstAppearance);

  const repeatedDocument = loadFixture("sidebar-root-tag.html").document;
  const repeatedTag = repeatedDocument.querySelector("#sidebar-work");
  createTestRenderer(repeatedDocument, {}, {
    settings: { colorMode: "manual", pinnedTagsAutoColor: true }
  }).processRoot(repeatedDocument);
  assert.equal(repeatedTag.dataset.flomoColorTagAppearance, firstAppearance);

  const explicitDocument = loadFixture("sidebar-root-tag.html").document;
  const explicitTag = explicitDocument.querySelector("#sidebar-work");
  createTestRenderer(explicitDocument, { "工作": "rose" }, {
    settings: { colorMode: "manual", pinnedTagsAutoColor: true }
  }).processRoot(explicitDocument);
  assert.match(explicitTag.dataset.flomoColorTagAppearance, /^rose\|/);
});

test("fixture 中的显式浅色和深色主题优先于系统偏好", () => {
  const lightDocument = loadFixture("light-theme.html").document;
  const lightRenderer = createTestRenderer(
    lightDocument,
    { "工作": "indigo" },
    { colorScheme: "dark", prefersDark: true }
  );
  lightRenderer.processRoot(lightDocument);
  assert.equal(lightDocument.querySelector("#light-tag").dataset.flomoColorTagTheme, "light");

  const darkDocument = loadFixture("dark-theme.html").document;
  const darkRenderer = createTestRenderer(
    darkDocument,
    { "工作": "indigo" },
    { colorScheme: "light", prefersDark: false }
  );
  darkRenderer.processRoot(darkDocument);
  assert.equal(darkDocument.querySelector("#dark-tag").dataset.flomoColorTagTheme, "dark");
});

test("style 中同时出现 light 和 dark 字样不会被当作显式深色主题", () => {
  const { document } = loadFixture("content-tag.html");
  document.documentElement.setAttribute(
    "style",
    "color-scheme: light dark; --light-surface: #fff; --dark-surface: #111"
  );
  const renderer = createTestRenderer(
    document,
    { "灵感": "violet" },
    { colorScheme: "light dark", prefersDark: false }
  );
  renderer.processRoot(document);
  assert.equal(document.querySelector("#content-tag").dataset.flomoColorTagTheme, "light");
});

test("属性观察覆盖标签复用和固定状态所需字段", () => {
  for (const attribute of ["tag", "data-tag", "data-tag-name", "data-tag-path", "data-pinned", "data-is-pinned", "href"]) {
    assert.ok(detection.OBSERVED_TAG_ATTRIBUTES.includes(attribute), attribute);
  }
});

test("原生绿色选中状态的 CSS 优先撤回插件色块", () => {
  const css = fs.readFileSync(path.join(__dirname, "../src/content.css"), "utf8");
  assert.match(css, /\[aria-selected="true"\]/);
  assert.match(css, /\[aria-current\]:not\(\[aria-current="false"\]\)/);
  assert.match(css, /background-color:\s*transparent\s*!important/);
  assert.match(css, /color:\s*inherit\s*!important/);
});

test("入门模板支持中文、英文和中英文混合", () => {
  const zh = presets.createTemplateRows("zh");
  const en = presets.createTemplateRows("en");
  const mixed = presets.createTemplateRows("mixed");
  assert.equal(zh.length, 10);
  assert.equal(en.length, 10);
  assert.equal(mixed.length, 20);
  assert.equal(zh.filter((row) => row.selected).length, 6);
  assert.equal(en.find((row) => row.id === "work-en").tag, "Work");
  assert.deepEqual(
    mixed.filter((row) => row.id.startsWith("work-")).map((row) => row.tag),
    ["工作", "Work"]
  );
});

test("用户可以在应用模板前修改标签名和颜色", () => {
  const rows = presets.createTemplateRows("en");
  const work = rows.find((row) => row.id === "work-en");
  work.tag = "6-Workspace";
  work.color = "rose";
  const result = presets.analyzeTemplateMerge({}, rows, { colors });
  assert.equal(result.overrides["6-Workspace"], "rose");
  assert.equal(Object.hasOwn(result.overrides, "Work"), false);
});

test("模板默认不覆盖已有规则，也可由用户主动覆盖", () => {
  const rows = presets.createTemplateRows("zh");
  const existing = { "工作": "coral", "自有标签": "teal" };
  const safe = presets.analyzeTemplateMerge(existing, rows, { colors });
  assert.equal(safe.overrides["工作"], "coral");
  assert.equal(safe.overrides["自有标签"], "teal");
  assert.equal(safe.conflicts, 1);
  assert.equal(safe.overwritten, 0);

  const overwrite = presets.analyzeTemplateMerge(existing, rows, { colors, overwrite: true });
  assert.equal(overwrite.overrides["工作"], "indigo");
  assert.equal(overwrite.overrides["自有标签"], "teal");
  assert.equal(overwrite.overwritten, 1);
});

test("模板规则继续支持父标签颜色继承给子标签", () => {
  const rows = presets.createTemplateRows("zh");
  const result = presets.analyzeTemplateMerge({}, rows, { colors });
  assert.equal(
    colors.resolveTagAppearance("工作/会议", result.overrides, false).paletteName,
    "indigo"
  );
});

test("重复应用模板不会制造重复规则或异常", () => {
  const rows = presets.createTemplateRows("mixed");
  const first = presets.analyzeTemplateMerge({}, rows, { colors });
  const second = presets.analyzeTemplateMerge(first.overrides, rows, { colors });
  assert.deepEqual(second.overrides, first.overrides);
  assert.equal(second.added, 0);
  assert.equal(second.conflicts, 12);
  assert.equal(second.preserved, 12);
});

test("撤销模板只回滚模板仍拥有的规则并保留后续修改", () => {
  const previous = { "工作": "rose", "自有标签": "teal" };
  const applied = presets.analyzeTemplateMerge(
    previous,
    presets.createTemplateRows("zh"),
    { colors, overwrite: true }
  ).overrides;
  const undo = presets.createTemplateUndo(previous, applied);
  const current = {
    ...applied,
    "工作": "coral",
    "模板后新增": "sky"
  };
  const result = presets.applyTemplateUndo(current, undo);

  assert.equal(result.overrides["工作"], "coral");
  assert.equal(result.overrides["自有标签"], "teal");
  assert.equal(result.overrides["模板后新增"], "sky");
  assert.equal(Object.hasOwn(result.overrides, "个人"), false);
  assert.equal(result.reverted, 5);
  assert.equal(result.preserved, 1);
});

test("规则按层级展示并标明显式设置和继承来源", () => {
  const rows = settingsTools.buildRuleHierarchy({
    "工作": "indigo",
    "工作/项目/A": "sky",
    "个人": "jade"
  });
  assert.deepEqual(
    rows.map(({ tag, depth, explicit, sourceTag, color }) => ({
      tag,
      depth,
      explicit,
      sourceTag,
      color
    })),
    [
      { tag: "个人", depth: 0, explicit: true, sourceTag: null, color: "jade" },
      { tag: "工作", depth: 0, explicit: true, sourceTag: null, color: "indigo" },
      { tag: "工作/项目", depth: 1, explicit: false, sourceTag: "工作", color: "indigo" },
      { tag: "工作/项目/A", depth: 2, explicit: true, sourceTag: null, color: "sky" }
    ]
  );
});

test("规则支持名称、颜色和自定义十六进制筛选", () => {
  const rows = settingsTools.buildRuleHierarchy({
    "工作": "indigo",
    "工作/项目": "#8b5cf6",
    "个人": "jade"
  });
  assert.deepEqual(
    settingsTools.filterRuleRows(rows, { query: "项目" }, colors).map((row) => row.tag),
    ["工作/项目"]
  );
  assert.deepEqual(
    settingsTools.filterRuleRows(rows, { color: "jade" }, colors).map((row) => row.tag),
    ["个人"]
  );
  assert.deepEqual(
    settingsTools.filterRuleRows(rows, { customOnly: true }, colors).map((row) => row.tag),
    ["工作/项目"]
  );
});

test("批量添加会先解析有效、重复、冲突和无效规则", () => {
  const analysis = settingsTools.parseBatchRules(
    [
      "工作 = indigo",
      "个人 = jade",
      "摄影 = #8b5cf6",
      "学习/医学 = sky",
      "摄影 = coral",
      "错误行",
      "问题 = rainbow"
    ].join("\n"),
    { "工作": "rose" },
    colors
  );
  assert.equal(analysis.valid, 4);
  assert.equal(analysis.conflicts, 1);
  assert.equal(analysis.duplicates, 1);
  assert.equal(analysis.invalid, 3);

  const safe = settingsTools.applyBatchRules({ "工作": "rose" }, analysis);
  assert.equal(safe.overrides["工作"], "rose");
  assert.equal(safe.overrides["摄影"], "#8b5cf6");
  assert.equal(safe.preserved, 1);

  const overwrite = settingsTools.applyBatchRules({ "工作": "rose" }, analysis, true);
  assert.equal(overwrite.overrides["工作"], "indigo");
  assert.equal(overwrite.overwritten, 1);
});

test("批量确认时重新检查当前规则而不是信任预览冲突状态", () => {
  const preview = settingsTools.parseBatchRules("工作 = indigo", {}, colors);
  assert.equal(preview.entries[0].conflict, false);

  const result = settingsTools.applyBatchRules({ "工作": "rose" }, preview, false);
  assert.equal(result.overrides["工作"], "rose");
  assert.equal(result.added, 0);
  assert.equal(result.preserved, 1);
});

test("新备份包含元数据、版本和日期文件名", () => {
  const date = new Date("2026-07-30T06:00:00.000Z");
  const settings = colors.cloneDefaultSettings();
  settings.overrides = { "工作": "indigo" };
  const backup = settingsTools.createBackup(settings, "0.3.0", date);
  assert.deepEqual(backup, {
    format: "flomo-color-tags-backup",
    formatVersion: 1,
    extensionVersion: "0.3.0",
    exportedAt: "2026-07-30T06:00:00.000Z",
    settings
  });
  assert.equal(
    settingsTools.createBackupFilename(new Date(2026, 6, 30)),
    "flomo-color-tags-backup-2026-07-30.json"
  );
});

test("恢复配置兼容旧 JSON 和新备份，并统计问题规则", () => {
  const sourceSettings = {
    settingsVersion: 9,
    enabled: false,
    overrides: {
      "#工作": "indigo",
      "工作": "rose",
      "个人": "jade",
      "错误": "rainbow"
    }
  };
  const legacy = settingsTools.parseBackupPayload({ version: 1, settings: sourceSettings }, colors);
  assert.equal(legacy.format, "legacy-wrapper");
  assert.deepEqual(legacy.stats, { validRules: 2, duplicateRules: 1, invalidRules: 1 });
  assert.equal(legacy.settings.enabled, false);
  assert.equal(legacy.settings.settingsVersion, 10);
  assert.equal(legacy.settings.pinnedTagsAutoColor, false);
  assert.deepEqual(legacy.settings.overrides, { "工作": "indigo", "个人": "jade" });

  const modern = settingsTools.parseBackupPayload(
    settingsTools.createBackup(sourceSettings, "0.3.0", new Date("2026-07-30T06:00:00.000Z")),
    colors
  );
  assert.equal(modern.format, "backup");
  assert.deepEqual(modern.stats, legacy.stats);
  assert.equal(modern.settings.settingsVersion, 10);

  const older = settingsTools.parseBackupPayload({
    settingsVersion: 8,
    overrides: { "旧版规则": "teal" }
  }, colors);
  assert.equal(older.settings.settingsVersion, 10);
  assert.deepEqual(older.settings.overrides, { "旧版规则": "teal" });

  const versionless = settingsTools.parseBackupPayload({
    overrides: { "无版本规则": "amber" }
  }, colors);
  assert.equal(versionless.settings.settingsVersion, 10);
  assert.deepEqual(versionless.settings.overrides, { "无版本规则": "amber" });
});

test("损坏或不受支持的备份会明确拒绝", () => {
  assert.throws(
    () => settingsTools.parseBackupPayload({ format: "flomo-color-tags-backup", formatVersion: 99, settings: {} }, colors),
    /不支持/
  );
  assert.throws(
    () => settingsTools.parseBackupPayload({ settingsVersion: 10 }, colors),
    /缺少颜色规则/
  );
  assert.throws(
    () => settingsTools.parseBackupPayload({ settingsVersion: 11, overrides: {} }, colors),
    /高于当前支持的 10/
  );
  assert.throws(
    () => settingsTools.parseBackupPayload({ settingsVersion: "11", overrides: {} }, colors),
    /设置版本无效/
  );
});

test("设置页能完整加载并执行快速开始、模板、筛选和批量预览", async () => {
  const html = fs.readFileSync(path.join(__dirname, "../options/options.html"), "utf8");
  const { document, window } = parseHTML(html);
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.HTMLElement.prototype.focus = () => {};
  Object.defineProperty(window.HTMLSelectElement.prototype, "value", {
    configurable: true,
    get() {
      const selected = Array.from(this.options).find((option) => option.selected);
      return (selected || this.options[0])?.value || "";
    },
    set(value) {
      for (const option of this.options) {
        option.selected = option.value === value;
      }
    }
  });
  let storedSettings = {
    ...colors.cloneDefaultSettings(),
    overrides: {
      "工作": "indigo",
      "工作/项目/A": "sky",
      "摄影": "#8b5cf6"
    }
  };
  const chrome = {
    runtime: {
      getManifest: () => ({ version: "0.3.0" })
    },
    storage: {
      local: {
        get: async () => ({ settings: storedSettings }),
        set: async ({ settings }) => {
          storedSettings = settings;
        }
      },
      onChanged: {
        addListener: () => {}
      }
    }
  };
  const context = vm.createContext({
    ...window,
    window,
    document,
    chrome,
    Blob,
    URL,
    console,
    structuredClone,
    setTimeout,
    clearTimeout,
    confirm: () => true
  });
  context.globalThis = context;
  for (const file of [
    "../src/tag-colors.js",
    "../src/starter-presets.js",
    "../src/settings-tools.js",
    "../options/options.js"
  ]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, file), "utf8"), context, {
      filename: file
    });
  }
  await new Promise((resolve) => setImmediate(resolve));

  assert.ok(document.querySelector(".quick-start"));
  assert.equal(document.querySelector("#pinned-tags-auto-color").checked, false);
  document.querySelector("#quick-pinned").click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(storedSettings.pinnedTagsAutoColor, true);
  assert.equal(document.querySelector("#pinned-tags-auto-color").checked, true);

  assert.equal(document.querySelectorAll("#template-rows tr").length, 20);
  assert.match(document.querySelector("#template-summary").textContent, /将新增/);
  assert.equal(document.querySelectorAll("#colored-tags tr").length, 4);

  const language = document.querySelector("#template-language");
  language.value = "zh";
  language.dispatchEvent(new window.Event("change"));
  assert.equal(document.querySelectorAll("#template-rows tr").length, 10);

  document.querySelector("#apply-template").click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(storedSettings.overrides["个人"], "jade");

  const contentEnabled = document.querySelector("#content-enabled");
  contentEnabled.checked = false;
  contentEnabled.dispatchEvent(new window.Event("change"));
  await new Promise((resolve) => setImmediate(resolve));

  const tagName = document.querySelector("#tag-name");
  tagName.value = "模板后新增";
  document.querySelector("#rule-form").dispatchEvent(
    new window.Event("submit", { bubbles: true, cancelable: true })
  );
  await new Promise((resolve) => setImmediate(resolve));

  document.querySelector("#undo-template").click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(storedSettings.contentEnabled, false);
  assert.equal(storedSettings.pinnedTagsAutoColor, true);
  assert.equal(storedSettings.overrides["模板后新增"], "coral");
  assert.equal(Object.hasOwn(storedSettings.overrides, "个人"), false);

  document.querySelector("#apply-template").click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(storedSettings.overrides["个人"], "jade");
  assert.equal(document.querySelector("#undo-template").disabled, false);

  const restoredSettings = {
    ...colors.cloneDefaultSettings(),
    contentEnabled: false,
    pinnedTagsAutoColor: true,
    overrides: {
      "工作": "indigo",
      "工作/项目/A": "sky",
      "摄影": "#8b5cf6",
      "个人": "jade",
      "医学": "coral",
      "模板后新增": "coral"
    }
  };
  const importSettings = document.querySelector("#import-settings");
  Object.defineProperty(importSettings, "files", {
    configurable: true,
    value: [{
      text: async () => JSON.stringify(
        settingsTools.createBackup(
          restoredSettings,
          "0.3.0",
          new Date("2026-07-30T06:00:00.000Z")
        )
      )
    }]
  });
  importSettings.dispatchEvent(new window.Event("change"));
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(document.querySelector("#undo-template").disabled, true);
  document.querySelector("#undo-template").click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(storedSettings.overrides["个人"], "jade");
  assert.equal(storedSettings.overrides["医学"], "coral");
  assert.equal(storedSettings.pinnedTagsAutoColor, true);

  const search = document.querySelector("#rule-search");
  search.value = "项目";
  search.dispatchEvent(new window.Event("input"));
  assert.equal(document.querySelectorAll("#colored-tags tr").length, 2);

  const batch = document.querySelector("#batch-rules");
  batch.value = "预览后新增 = indigo";
  batch.dispatchEvent(new window.Event("input"));
  document.querySelector("#preview-batch").click();
  assert.equal(document.querySelector("#apply-batch").disabled, false);

  tagName.value = "预览后新增";
  document.querySelector("#rule-form").dispatchEvent(
    new window.Event("submit", { bubbles: true, cancelable: true })
  );
  await new Promise((resolve) => setImmediate(resolve));
  document.querySelector("#apply-batch").click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(storedSettings.overrides["预览后新增"], "coral");

  batch.value = "个人 = jade\n问题 = rainbow";
  batch.dispatchEvent(new window.Event("input"));
  document.querySelector("#preview-batch").click();
  assert.match(document.querySelector("#batch-preview").textContent, /有效规则：1/);
  assert.match(document.querySelector("#batch-preview").textContent, /无效规则：1/);
  assert.equal(document.querySelector("#apply-batch").disabled, true);

  tagName.value = "   ";
  document.querySelector("#rule-form").dispatchEvent(
    new window.Event("submit", { bubbles: true, cancelable: true })
  );
  assert.equal(document.querySelector("#status").classList.contains("is-error"), true);
  assert.equal(document.querySelector("#status").getAttribute("role"), "alert");

  const optionsCss = fs.readFileSync(path.join(__dirname, "../options/options.css"), "utf8");
  assert.doesNotMatch(optionsCss, /\.file-button input\s*\{[^}]*display:\s*none/s);
  assert.match(optionsCss, /\.file-button:focus-within/);
  assert.match(optionsCss, /\.status\.is-error/);
});

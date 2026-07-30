const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { parseHTML } = require("linkedom");
const colors = require("../src/tag-colors.js");
const detection = require("../src/tag-detection.js");
const rendering = require("../src/tag-rendering.js");
const presets = require("../src/starter-presets.js");

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
    settingsVersion: 9,
    colorMode: "manual",
    overrides: { "#示例根目录": "jade", "无效示例": "rainbow", "示例灵感": "#ff00aa" }
  });
  assert.equal(settings.enabled, false);
  assert.equal(settings.colorMode, "manual");
  assert.deepEqual(settings.overrides, { "示例根目录": "jade", "示例灵感": "#ff00aa" });
});

test("旧版设置会迁移为不含个人标签的空白白名单", () => {
  const settings = colors.sanitizeSettings({ settingsVersion: 8, enabled: true, overrides: { "示例项目": "jade", "示例摘录": "sky", "示例主题": "violet" } });
  assert.equal(settings.colorMode, "manual");
  assert.deepEqual(settings.overrides, {});
});

test("当前版本设置会保留浏览器本地的用户自定义规则", () => {
  const settings = colors.sanitizeSettings({ settingsVersion: 9, enabled: true, overrides: { "示例根目录": "jade" } });
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

test("属性观察覆盖标签复用所需字段", () => {
  for (const attribute of ["data-tag", "data-tag-name", "data-tag-path", "href"]) {
    assert.ok(detection.OBSERVED_TAG_ATTRIBUTES.includes(attribute), attribute);
  }
});

test("原生绿色选中状态的 CSS 优先撤回插件色块", () => {
  const css = fs.readFileSync(path.join(__dirname, "../src/content.css"), "utf8");
  assert.match(css, /\[aria-selected="true"\]/);
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

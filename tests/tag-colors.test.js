const test = require("node:test");
const assert = require("node:assert/strict");
const colors = require("../src/tag-colors.js");

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

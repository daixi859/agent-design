import { describe, expect, it } from "vitest";

import { DEFAULT_THEME, isTheme, resolveTheme, THEMES } from "./theme";

describe("theme", () => {
  it("四套主题都能解析出明暗", () => {
    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
    expect(resolveTheme("zai-light")).toBe("light");
    expect(resolveTheme("zai-dark")).toBe("dark");
  });

  it("isTheme 拒绝未知值", () => {
    expect(isTheme("dark")).toBe(true);
    expect(isTheme("solarized")).toBe(false);
    expect(isTheme(null)).toBe(false);
  });

  it("缺省主题在列表里，且列表与类型一致", () => {
    expect(THEMES.map((theme) => theme.value)).toContain(DEFAULT_THEME);
    expect(THEMES).toHaveLength(4);
  });
});

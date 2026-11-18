/** Trigger Menu 纯逻辑契约（ADR-0017）：行首 `/` 触发检测 + 目录映射 + 过滤排序分组 */
import { describe, expect, it } from "vitest";
import type { CommandCatalogItem } from "@pi-studio/shared/protocol";
import {
  detectSlashTrigger,
  filterCommands,
  groupMenuCommands,
  menuCommandsFromCatalog,
  type MenuCommand,
} from "./trigger-menu";

const cmd = (name: string, extra: Partial<MenuCommand> = {}): MenuCommand => ({
  name,
  trigger: `/${name}`,
  source: "prompt",
  ...extra,
});

/** 目录条目夹具：source 缺省为 prompt */
const entry = (name: string, source: CommandCatalogItem["source"] = "prompt"): CommandCatalogItem => ({
  name,
  trigger: `/${name}`,
  source,
});

describe("detectSlashTrigger · 行首触发检测", () => {
  it("行首 `/`：返回已键入的查询串", () => {
    expect(detectSlashTrigger("/com", 4)).toBe("com");
  });

  it("光标贴着 `/`：空查询（列全部命令）", () => {
    expect(detectSlashTrigger("/", 1)).toBe("");
  });

  it("非行首的 `/` 不触发（URL、行中提及）", () => {
    expect(detectSlashTrigger("see https://x", 12)).toBeNull();
    expect(detectSlashTrigger("a /commit", 9)).toBeNull();
  });

  it("光标越过首 token（在写参数）不触发", () => {
    expect(detectSlashTrigger("/commit done", 12)).toBeNull();
  });

  it("光标停在 token 末尾仍触发（补全进行中）", () => {
    expect(detectSlashTrigger("/commit", 7)).toBe("commit");
  });

  it("缩进行的首 token 同样触发", () => {
    expect(detectSlashTrigger("  /co", 5)).toBe("co");
  });

  it("多行文本：只看光标所在行", () => {
    const text = "第一行\n/te";
    expect(detectSlashTrigger(text, text.length)).toBe("te");
    expect(detectSlashTrigger("/ok\n第二行", 7)).toBeNull();
  });
});

describe("filterCommands · 过滤与排序", () => {
  const items = [cmd("commit"), cmd("compact"), cmd("context"), cmd("model"), cmd("skill:commit")];

  it("空查询按原序截前 20", () => {
    expect(filterCommands(items, "").map((c) => c.name)).toEqual([
      "commit",
      "compact",
      "context",
      "model",
      "skill:commit",
    ]);
  });

  it("精确 → 前缀 → 包含：commit 精确压过 skill:commit 包含", () => {
    expect(filterCommands(items, "commit").map((c) => c.name)).toEqual(["commit", "skill:commit"]);
    expect(filterCommands(items, "comp").map((c) => c.name)).toEqual(["compact"]);
    expect(filterCommands(items, "con").map((c) => c.name)).toEqual(["context"]);
  });

  it("大小写不敏感", () => {
    expect(filterCommands([cmd("Model")], "mod").map((c) => c.name)).toEqual(["Model"]);
  });

  it("无命中返回空数组（菜单渲染空态）", () => {
    expect(filterCommands(items, "zzz")).toEqual([]);
  });

  it("上限 20 条", () => {
    const many = Array.from({ length: 30 }, (_, i) => cmd(`cmd${i}`));
    expect(filterCommands(many, "cmd")).toHaveLength(20);
  });
});

describe("menuCommandsFromCatalog · 目录映射收敛", () => {
  it("只收 skills 与 prompt 模板，扩展命令不入菜单", () => {
    const commands = menuCommandsFromCatalog([
      entry("review", "extension"),
      entry("commit", "prompt"),
      entry("current-time", "skill"),
    ]);
    expect(commands.map((c) => c.name)).toEqual(["commit", "current-time"]);
    expect(commands.map((c) => c.source)).toEqual(["prompt", "skill"]);
  });

  it("描述与参数提示随条目携带", () => {
    const commands = menuCommandsFromCatalog([
      { name: "commit", trigger: "/commit", description: "提交", argumentHint: "<msg>", source: "prompt" },
    ]);
    expect(commands[0]).toEqual({
      name: "commit",
      trigger: "/commit",
      description: "提交",
      argumentHint: "<msg>",
      source: "prompt",
    });
  });
});

describe("groupMenuCommands · 固定序分组", () => {
  it("技能在前、提示词居中、内建命令组殿后；空组不出现", () => {
    const groups = groupMenuCommands([
      cmd("a"),
      cmd("b", { source: "skill" }),
      cmd("c"),
      cmd("compact", { source: "builtin", trigger: "/compact" }),
    ]);
    expect(groups).toEqual([
      { source: "skill", items: [cmd("b", { source: "skill" })] },
      { source: "prompt", items: [cmd("a"), cmd("c")] },
      { source: "builtin", items: [cmd("compact", { source: "builtin", trigger: "/compact" })] },
    ]);
  });

  it("全空返回空数组", () => {
    expect(groupMenuCommands([])).toEqual([]);
  });
});

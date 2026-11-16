/** TranscriptModel 黄金样本测试：interface 即测试面——合成 Entry 进，完整模型出。
    样本按领域概念分节：Active Branch 回溯（ADR-0004）、Turn/Tool Group 切分（ADR-0006）、
    注解收缩、Composer 徽标派生。 */
import { describe, expect, it } from "vitest";
import type {
  AssistantMessage,
  ContentBlock,
  SessionEntry,
  SessionHeaderEntry,
} from "../../shared/pi-types";
import { buildTranscriptModel } from "./transcript-model";

// ---------- 合成 Entry 构造器 ----------

const TS = "2026-01-01T00:00:00.000Z";

function header(id = "s1"): SessionHeaderEntry {
  return { type: "session", id, parentId: null, timestamp: TS, version: 3 };
}

function user(id: string, parentId: string | null, text = "hello"): SessionEntry {
  return { type: "message", id, parentId, timestamp: TS, message: { role: "user", content: text } };
}

function assistant(
  id: string,
  parentId: string | null,
  content: ContentBlock[],
  extra: Partial<AssistantMessage> = {},
): SessionEntry {
  return {
    type: "message",
    id,
    parentId,
    timestamp: TS,
    message: { role: "assistant", content, ...extra },
  };
}

function toolResult(id: string, parentId: string | null, toolCallId: string, toolName = "bash"): SessionEntry {
  return {
    type: "message",
    id,
    parentId,
    timestamp: TS,
    message: { role: "toolResult", toolCallId, toolName, content: [{ type: "text", text: "ok" }] },
  };
}

function bashExec(id: string, parentId: string | null, command = "ls"): SessionEntry {
  return { type: "message", id, parentId, timestamp: TS, message: { role: "bashExecution", command, output: "file", exitCode: 0 } };
}

const text = (t: string): ContentBlock => ({ type: "text", text: t });
const thinking = (t: string): ContentBlock => ({ type: "thinking", thinking: t });
const call = (id: string, name = "bash"): ContentBlock => ({ type: "toolCall", id, name, arguments: { command: "ls" } });

// ---------- Active Branch（ADR-0004） ----------

describe("buildTranscriptModel · Active Branch 回溯", () => {
  it("空输入返回零值模型", () => {
    expect(buildTranscriptModel([])).toEqual({
      turns: [],
      orphanAnnotations: [],
      abandonedCount: 0,
      model: undefined,
      thinkingLevel: undefined,
      toolCallCount: 0,
    });
  });

  it("线性会话：单 Turn，无被弃条目", () => {
    const model = buildTranscriptModel([header(), user("u1", null), assistant("a1", "u1", [text("hi")])]);
    expect(model.turns).toHaveLength(1);
    expect(model.turns[0].id).toBe("u1");
    expect(model.turns[0].items.map((item) => item.kind)).toEqual(["text"]);
    expect(model.abandonedCount).toBe(0);
  });

  it("被弃分支不渲染，只计 abandonedCount", () => {
    // a1 在旧分支上（无后继引用它），u2 从 u1 重新出发成为活动叶子
    const model = buildTranscriptModel([
      header(),
      user("u1", null),
      assistant("a1", "u1", [text("old")]),
      user("u2", "u1"),
    ]);
    expect(model.abandonedCount).toBe(1);
    expect(model.turns.map((turn) => turn.id)).toEqual(["u1", "u2"]);
    expect(model.turns.flatMap((turn) => turn.items)).toHaveLength(0);
  });

  it("header 不参与分支计数", () => {
    const model = buildTranscriptModel([header("s1"), user("u1", null)]);
    expect(model.abandonedCount).toBe(0);
    expect(model.turns).toHaveLength(1);
  });
});

// ---------- Turn / Tool Group（ADR-0006） ----------

describe("buildTranscriptModel · Turn 与 Tool Group 切分", () => {
  it("非文本内容跨 assistant 消息归并进同一 Tool Group，text 是分隔符", () => {
    const model = buildTranscriptModel([
      header(),
      user("u1", null),
      assistant("m1", "u1", [thinking("hmm"), call("t1")]),
      assistant("m2", "m1", [thinking("more"), call("t2")]),
      assistant("m3", "m2", [text("done")]),
    ]);
    const items = model.turns[0].items;
    expect(items.map((item) => item.kind)).toEqual(["group", "text"]);
    const group = items[0].kind === "group" ? items[0].group : [];
    expect(group.map((item) => item.kind)).toEqual(["thinking", "toolCall", "thinking", "toolCall"]);
    expect((items[1] as { text: string }).text).toBe("done");
  });

  it("toolCall 与同分支 toolResult 配对，显示字段就位", () => {
    const model = buildTranscriptModel([
      header(),
      user("u1", null),
      assistant("m1", "u1", [call("t1", "read")]),
      toolResult("r1", "m1", "t1", "read"),
    ]);
    const group = model.turns[0].items[0].kind === "group" ? model.turns[0].items[0].group : [];
    expect(group).toHaveLength(1);
    const item = group[0];
    expect(item.kind).toBe("toolCall");
    if (item.kind === "toolCall") {
      expect(item.name).toBe("read");
      expect(item.summary).toBe("ls"); // 来自 arguments.command
      expect(item.output).toBe("ok"); // 配对结果 text 块拼接
    }
  });

  it("孤儿 toolResult（无前置调用）补成合成 toolCall 条目", () => {
    const model = buildTranscriptModel([
      header(),
      user("u1", null),
      toolResult("r1", "u1", "tX", "grep"),
    ]);
    const group = model.turns[0].items[0].kind === "group" ? model.turns[0].items[0].group : [];
    const item = group[0];
    expect(item.kind).toBe("toolCall");
    if (item.kind === "toolCall") {
      expect(item.name).toBe("grep");
      expect(item.args).toBeUndefined();
      expect(item.summary).toBeUndefined();
      expect(item.output).toBe("ok");
    }
  });

  it("bashExecution 归一为 toolCall 显示条目（name=bash，命令即摘要）", () => {
    const model = buildTranscriptModel([header(), user("u1", null), bashExec("b1", "u1", "ls")]);
    const group = model.turns[0].items[0].kind === "group" ? model.turns[0].items[0].group : [];
    const item = group[0];
    expect(item.kind).toBe("toolCall");
    if (item.kind === "toolCall") {
      expect(item.name).toBe("bash");
      expect(item.args).toEqual({ command: "ls" });
      expect(item.summary).toBe("ls");
      expect(item.output).toBe("file");
      expect(item.isError).toBe(false);
    }
  });

  it("bashExecution 被取消或非零退出 → isError", () => {
    const cancelled = buildTranscriptModel([
      header(),
      user("u1", null),
      { type: "message", id: "b1", parentId: "u1", timestamp: TS, message: { role: "bashExecution", command: "sleep 5", cancelled: true } },
    ]);
    const failed = buildTranscriptModel([
      header(),
      user("u1", null),
      { type: "message", id: "b1", parentId: "u1", timestamp: TS, message: { role: "bashExecution", command: "grep x", exitCode: 1 } },
    ]);
    const itemOf = (model: ReturnType<typeof buildTranscriptModel>) => {
      const group = model.turns[0].items[0].kind === "group" ? model.turns[0].items[0].group : [];
      return group[0].kind === "toolCall" ? group[0].isError : undefined;
    };
    expect(itemOf(cancelled)).toBe(true);
    expect(itemOf(failed)).toBe(true);
  });

  it("assistant stopReason=aborted 产生 warning 条目", () => {
    const model = buildTranscriptModel([
      header(),
      user("u1", null),
      assistant("m1", "u1", [text("part")], { stopReason: "aborted" }),
    ]);
    const warning = model.turns[0].items[1];
    expect(warning.kind).toBe("warning");
    if (warning.kind === "warning") expect(warning.note).toBe("aborted");
  });

  it("assistant stopReason=error 携带 errorMessage", () => {
    const model = buildTranscriptModel([
      header(),
      user("u1", null),
      assistant("m1", "u1", [], { stopReason: "error", errorMessage: "boom" }),
    ]);
    const warning = model.turns[0].items[0];
    expect(warning.kind).toBe("warning");
    if (warning.kind === "warning") {
      expect(warning.note).toBe("error");
      expect(warning.message).toBe("boom");
    }
  });
});

// ---------- 显示字段提取（归一化规则） ----------

describe("buildTranscriptModel · 显示字段提取", () => {
  it("summary 提取优先级：path > command > pattern > glob > 首个字符串值", () => {
    const priority = buildTranscriptModel([
      header(),
      user("u1", null),
      assistant("m1", "u1", [{ type: "toolCall", id: "t1", name: "x", arguments: { command: "c", path: "p" } }]),
    ]);
    const fallback = buildTranscriptModel([
      header(),
      user("u1", null),
      assistant("m1", "u1", [{ type: "toolCall", id: "t1", name: "x", arguments: { n: 1, flag: true } }]),
    ]);
    const summaryOf = (model: ReturnType<typeof buildTranscriptModel>) => {
      const group = model.turns[0].items[0].kind === "group" ? model.turns[0].items[0].group : [];
      return group[0].kind === "toolCall" ? group[0].summary : undefined;
    };
    expect(summaryOf(priority)).toBe("p");
    expect(summaryOf(fallback)).toBe('{"n":1,"flag":true}'); // 无字符串值时回退 args JSON
  });

  it("details.diff 提取进 diff 字段", () => {
    const model = buildTranscriptModel([
      header(),
      user("u1", null),
      assistant("m1", "u1", [{ type: "toolCall", id: "t1", name: "edit" }]),
      {
        type: "message",
        id: "r1",
        parentId: "m1",
        timestamp: TS,
        message: {
          role: "toolResult",
          toolCallId: "t1",
          toolName: "edit",
          content: [{ type: "text", text: "Edited 1 file" }],
          details: { diff: "@@ -1 +1 @@", patch: "ignored" },
        },
      },
    ]);
    const group = model.turns[0].items[0].kind === "group" ? model.turns[0].items[0].group : [];
    const item = group[0];
    expect(item.kind).toBe("toolCall");
    if (item.kind === "toolCall") {
      expect(item.diff).toBe("@@ -1 +1 @@");
      expect(item.output).toBe("Edited 1 file");
    }
  });

  it("配对结果的 isError 透传到显示条目", () => {
    const model = buildTranscriptModel([
      header(),
      user("u1", null),
      assistant("m1", "u1", [{ type: "toolCall", id: "t1", name: "bash" }]),
      {
        type: "message",
        id: "r1",
        parentId: "m1",
        timestamp: TS,
        message: {
          role: "toolResult",
          toolCallId: "t1",
          toolName: "bash",
          content: [{ type: "text", text: "not found" }],
          isError: true,
        },
      },
    ]);
    const group = model.turns[0].items[0].kind === "group" ? model.turns[0].items[0].group : [];
    expect(group[0].kind === "toolCall" && group[0].isError).toBe(true);
  });
});

// ---------- 注解收缩（ADR-0006 修订） ----------

describe("buildTranscriptModel · 注解收缩", () => {
  it("compaction 与首次 session_info 渲染为注解，重名 session_info 去重", () => {
    // 注解条目链式挂在分支上（c1→s1→s2→s3），否则会被分支回溯裁掉
    const model = buildTranscriptModel([
      header(),
      user("u1", null),
      { type: "compaction", id: "c1", parentId: "u1", timestamp: TS, tokensBefore: 4321 },
      { type: "session_info", id: "s1", parentId: "c1", timestamp: TS, name: "name-a" },
      { type: "session_info", id: "s2", parentId: "s1", timestamp: TS, name: "name-a" },
      { type: "session_info", id: "s3", parentId: "s2", timestamp: TS, name: "name-b" },
    ]);
    const kinds = model.turns[0].items.map((item) => item.kind);
    expect(kinds).toEqual(["annotation", "annotation", "annotation"]);
  });

  it("首条 user 之前的注解落入 orphanAnnotations", () => {
    // 注解是 user 的祖先（c0→u1），在分支上位于首条 user 之前
    const model = buildTranscriptModel([
      header(),
      { type: "compaction", id: "c0", parentId: null, timestamp: TS },
      user("u1", "c0"),
    ]);
    expect(model.orphanAnnotations.map((entry) => entry.id)).toEqual(["c0"]);
    expect(model.turns[0].items.filter((item) => item.kind === "annotation")).toHaveLength(0);
  });
});

// ---------- Composer 徽标派生 ----------

describe("buildTranscriptModel · Composer 徽标派生", () => {
  it("thinkingLevel 取活动分支上最后一次 thinking_level_change", () => {
    const model = buildTranscriptModel([
      header(),
      user("u1", null),
      { type: "thinking_level_change", id: "l1", parentId: "u1", timestamp: TS, thinkingLevel: "medium" },
      { type: "thinking_level_change", id: "l2", parentId: "l1", timestamp: TS, thinkingLevel: "high" },
    ]);
    expect(model.thinkingLevel).toBe("high");
  });

  it("model 取最后一次声明：model_change 在前、assistant.model 在后时后者胜", () => {
    const model = buildTranscriptModel([
      header(),
      user("u1", null),
      { type: "model_change", id: "mc1", parentId: "u1", timestamp: TS, provider: "anthropic", modelId: "claude-a" },
      assistant("m1", "mc1", [text("hi")], { provider: "openai", model: "gpt-b" }),
    ]);
    expect(model.model).toEqual({ provider: "openai", modelId: "gpt-b" });
  });

  it("assistant 未声明 model 时回落到 model_change", () => {
    const model = buildTranscriptModel([
      header(),
      user("u1", null),
      { type: "model_change", id: "mc1", parentId: "u1", timestamp: TS, provider: "anthropic", modelId: "claude-a" },
      assistant("m1", "mc1", [text("hi")]),
    ]);
    expect(model.model).toEqual({ provider: "anthropic", modelId: "claude-a" });
  });

  it("toolCallCount 统计配对/孤儿 toolCall 与 bashExecution，thinking 不计", () => {
    const model = buildTranscriptModel([
      header(),
      user("u1", null),
      bashExec("b1", "u1"),
      assistant("m1", "b1", [thinking("hmm"), call("t1")]),
      toolResult("r1", "m1", "t1"),
      assistant("m2", "m1", [call("t2")]),
    ]);
    expect(model.toolCallCount).toBe(3);
  });

  it("被弃分支上的调用不计入 toolCallCount", () => {
    const model = buildTranscriptModel([
      header(),
      user("u1", null),
      assistant("a1", "u1", [call("t-old")]), // 被弃
      user("u2", "u1"),
      assistant("m1", "u2", [call("t1")]),
    ]);
    expect(model.toolCallCount).toBe(1);
    expect(model.abandonedCount).toBe(1);
  });
});

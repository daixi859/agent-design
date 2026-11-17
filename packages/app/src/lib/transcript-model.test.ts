/** TranscriptModel 黄金样本测试：interface 即测试面——合成 Entry 进，完整模型出。
    样本按领域概念分节：Active Branch 回溯（ADR-0004）、Turn/Process Group 切分（ADR-0006）、
    注解收缩、Composer 徽标派生。 */
import { describe, expect, it } from "vitest";
import type {
  AssistantMessage,
  ContentBlock,
  SessionEntry,
  SessionHeaderEntry,
} from "@pi-studio/shared/pi-types";
import { activeLeafId, buildTranscriptModel } from "./transcript-model";

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

// ---------- 活动分支叶子（驱动视图的瞬态条目挂靠点，ADR-0012 补记七） ----------

describe("activeLeafId", () => {
  it("空输入与纯 header 输入返回 null", () => {
    expect(activeLeafId([])).toBeNull();
    expect(activeLeafId([header()])).toBeNull();
  });

  it("线性链取末条；分支分叉取叶子扫描的同一落点（与 buildActiveBranch 同规则）", () => {
    expect(activeLeafId([header(), user("u1", null), assistant("a1", "u1", [text("hi")])])).toBe("a1");
    // u2 与 a1 都 unreferenced：从末尾扫，a1 在后即 a1
    expect(
      activeLeafId([header(), user("u1", null), user("u2", "u1"), assistant("a1", "u1", [text("old")])]),
    ).toBe("a1");
  });
});

// ---------- Turn / Process Group（ADR-0006，ADR-0013 改名） ----------

describe("buildTranscriptModel · Turn 与 Process Group 切分", () => {
  it("非文本内容跨 assistant 消息归并进同一 Process Group，text 是分隔符", () => {
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
      expect(item.state).toBe("ok");
      expect(item.terminal).toEqual({ command: "ls", output: "file" });
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
      return group[0].kind === "toolCall" ? group[0].state : undefined;
    };
    // 取消与失败分开：ADR-0013 的四态语义
    expect(itemOf(cancelled)).toBe("stopped");
    expect(itemOf(failed)).toBe("error");
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
    expect(group[0].kind === "toolCall" && group[0].state).toBe("error");
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

  // 修复回归：扩展注入的用户可见消息此前被静默丢弃，内容在查看器里丢失
  it("display:true 的 custom_message 渲染为注解；display:false 隐藏", () => {
    const model = buildTranscriptModel([
      header(),
      user("u1", null),
      {
        type: "custom_message",
        id: "cm1",
        parentId: "u1",
        timestamp: TS,
        customType: "pi-review",
        content: "审查完成：2 处问题",
        display: true,
      },
      {
        type: "custom_message",
        id: "cm2",
        parentId: "cm1",
        timestamp: TS,
        customType: "hidden-thing",
        content: "不该出现",
        display: false,
      },
    ]);
    const annotations = model.turns[0].items.filter((item) => item.kind === "annotation");
    expect(annotations).toHaveLength(1);
    expect(annotations[0].kind === "annotation" && annotations[0].entry.id).toBe("cm1");
  });

  // 修复回归：上游清名落 session_info（无 name 字段），此前会渲染「命名为空」
  it("无 name 的 session_info 不渲染", () => {
    const model = buildTranscriptModel([
      header(),
      user("u1", null),
      { type: "session_info", id: "si0", parentId: "u1", timestamp: TS },
    ]);
    expect(model.turns[0].items.filter((item) => item.kind === "annotation")).toHaveLength(0);
  });

  // 系统提示词条目（ADR-0004 修订三）：user 前落 orphan、turn 内注解；内核空 diff 落的
  // sections:{} 条目无可展示内容，跳过
  it("system 消息按 sections 落注解，空 sections 跳过", () => {
    const systemPrompt = (id: string, parentId: string | null, sections: Record<string, string>): SessionEntry => ({
      type: "message",
      id,
      parentId,
      timestamp: TS,
      message: { role: "system", content: "", sections },
    });
    const model = buildTranscriptModel([
      header(),
      systemPrompt("sys0", null, { preamble: "You are…", project_context: "<project_context>…" }),
      user("u1", "sys0"),
      systemPrompt("sys1", "u1", { tools: "<tools>…" }),
      systemPrompt("sys2", "sys1", {}),
    ]);
    expect(model.orphanAnnotations.map((entry) => entry.id)).toEqual(["sys0"]);
    const annotations = model.turns[0].items.filter((item) => item.kind === "annotation");
    expect(annotations).toHaveLength(1);
    expect(annotations[0].kind === "annotation" && annotations[0].entry.id).toBe("sys1");
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

// ---------- ADR-0013 新增语义：四态、嵌套调用、穿插分组 ----------

describe("buildTranscriptModel · 工具四态（ADR-0013）", () => {
  it("无配对结果 → running（内核还在跑，或流式草稿）", () => {
    const model = buildTranscriptModel([
      header(),
      user("u1", null),
      assistant("m1", "u1", [call("t1", "bash")]),
    ]);
    const group = model.turns[0].items[0].kind === "group" ? model.turns[0].items[0].group : [];
    expect(group[0].kind === "toolCall" && group[0].state).toBe("running");
  });

  it("配对成功 → ok；isError → error", () => {
    const okModel = buildTranscriptModel([
      header(), user("u1", null),
      assistant("m1", "u1", [call("t1")]),
      toolResult("r1", "m1", "t1"),
    ]);
    const errModel = buildTranscriptModel([
      header(), user("u1", null),
      assistant("m1", "u1", [call("t1")]),
      {
        type: "message", id: "r1", parentId: "m1", timestamp: TS,
        message: { role: "toolResult", toolCallId: "t1", toolName: "bash", content: [], isError: true },
      },
    ]);
    const stateOf = (m: ReturnType<typeof buildTranscriptModel>) => {
      const g = m.turns[0].items[0].kind === "group" ? m.turns[0].items[0].group : [];
      return g[0].kind === "toolCall" ? g[0].state : undefined;
    };
    expect(stateOf(okModel)).toBe("ok");
    expect(stateOf(errModel)).toBe("error");
  });

  it("bashExecution 落进 terminal 字段（视图不必知道哪些工具是命令类）", () => {
    const model = buildTranscriptModel([header(), user("u1", null), bashExec("b1", "u1", "ls -la")]);
    const g = model.turns[0].items[0].kind === "group" ? model.turns[0].items[0].group : [];
    const item = g[0];
    expect(item.kind === "toolCall" && item.terminal).toEqual({ command: "ls -la", output: "file" });
  });
});

describe("buildTranscriptModel · 嵌套调用（kernel details.calls）", () => {
  it("details.calls 归一为 subCalls，args 保持 JSON 字符串、status 走 Tool State 四态", () => {
    const model = buildTranscriptModel([
      header(),
      user("u1", null),
      assistant("m1", "u1", [call("t1", "codemode")]),
      {
        type: "message", id: "r1", parentId: "m1", timestamp: TS,
        message: {
          role: "toolResult", toolCallId: "t1", toolName: "codemode",
          content: [{ type: "text", text: "Script completed" }],
          details: {
            calls: [
              { id: "c1", name: "browser_navigate", args: '{"url":"http://x/"}', status: "ok", durationMs: 12 },
              { id: "c2", name: "browser_click", args: '{"selector":"#a"}', status: "error", error: "timeout" },
            ],
          },
        },
      },
    ]);
    const g = model.turns[0].items[0].kind === "group" ? model.turns[0].items[0].group : [];
    const item = g[0];
    expect(item.kind).toBe("toolCall");
    if (item.kind !== "toolCall") return;
    expect(item.subCalls).toHaveLength(2);
    // args 是字符串：保持原样，不许在本层解析掉
    expect(item.subCalls?.[0].args).toBe('{"url":"http://x/"}');
    // 摘要从字符串里解析出来
    expect(item.subCalls?.[0].summary).toBe("http://x/");
    expect(item.subCalls?.[0].status).toBe("ok");
    expect(item.subCalls?.[1].status).toBe("error");
    expect(item.subCalls?.[1].error).toBe("timeout");
  });

  it("内核 cancelled 归一为 stopped（真实数据里确实出现过），未知/缺失状态留 undefined", () => {
    const model = buildTranscriptModel([
      header(),
      user("u1", null),
      assistant("m1", "u1", [call("t1", "codemode")]),
      {
        type: "message", id: "r1", parentId: "m1", timestamp: TS,
        message: {
          role: "toolResult", toolCallId: "t1", toolName: "codemode",
          content: [{ type: "text", text: "Script failed" }],
          details: {
            calls: [
              { id: "c1", name: "grep", args: '{"pattern":"x"}', status: "cancelled" },
              { id: "c2", name: "read", args: '{"path":"a.ts"}', status: "running" },
              { id: "c3", name: "find", args: '{"glob":"*.ts"}', status: "someFutureStatus" },
              { id: "c4", name: "ls", args: "{}" },
            ],
          },
        },
      },
    ]);
    const g = model.turns[0].items[0].kind === "group" ? model.turns[0].items[0].group : [];
    const item = g[0];
    if (item.kind !== "toolCall") throw new Error("expected toolCall");
    // cancelled 与顶层 bashExecution 的 stopped 同词汇
    expect(item.subCalls?.[0].status).toBe("stopped");
    expect(item.subCalls?.[1].status).toBe("running");
    // 未知状态不许伪造成 ok
    expect(item.subCalls?.[2].status).toBeUndefined();
    expect(item.subCalls?.[3].status).toBeUndefined();
  });

  it("details.calls 形状不合法时整段丢弃，不抛错", () => {
    const model = buildTranscriptModel([
      header(),
      user("u1", null),
      assistant("m1", "u1", [call("t1", "codemode")]),
      {
        type: "message", id: "r1", parentId: "m1", timestamp: TS,
        message: {
          role: "toolResult", toolCallId: "t1", toolName: "codemode",
          content: [{ type: "text", text: "x" }],
          details: { calls: ["not-an-object", { name: 42 }, { name: "ok", args: 7 }] },
        },
      },
    ]);
    const g = model.turns[0].items[0].kind === "group" ? model.turns[0].items[0].group : [];
    const item = g[0];
    if (item.kind !== "toolCall") throw new Error("expected toolCall");
    // 只有最后一项有合法 name
    expect(item.subCalls).toHaveLength(1);
    expect(item.subCalls?.[0].name).toBe("ok");
    expect(item.subCalls?.[0].args).toBeUndefined();
  });
});

describe("buildTranscriptModel · 穿插分组的顺序", () => {
  it("text 分隔出的多个过程组各自成组，且在 items 里保持源顺序", () => {
    const model = buildTranscriptModel([
      header(),
      user("u1", null),
      // 第 1 组：thinking + call
      assistant("m1", "u1", [thinking("first thought"), call("t1", "read")]),
      toolResult("r1", "m1", "t1", "read"),
      // 分隔回答
      assistant("m2", "m1", [{ type: "text", text: "先说一半" }]),
      // 第 2 组：两个 call
      assistant("m3", "m2", [call("t2", "edit")]),
      assistant("m4", "m3", [call("t3", "bash")]),
      toolResult("r2", "m4", "t2", "edit"),
      toolResult("r3", "m4", "t3", "bash"),
      // 收尾回答
      assistant("m5", "m4", [{ type: "text", text: "全部完成" }]),
    ]);
    expect(model.turns).toHaveLength(1);
    expect(model.turns[0].items.map((item) => item.kind)).toEqual([
      "group",
      "text",
      "group",
      "text",
    ]);
    const groups = model.turns[0].items.filter((item) => item.kind === "group");
    expect(groups[0].kind === "group" && groups[0].group.map((x) => x.kind)).toEqual(["thinking", "toolCall"]);
    expect(groups[1].kind === "group" && groups[1].group.map((x) => x.kind)).toEqual(["toolCall", "toolCall"]);
    expect(model.turns[0].items[1].kind === "text" && model.turns[0].items[1].text).toBe("先说一半");
  });

  it("同一 assistant 消息内 text→toolCall→text 被切成两组", () => {
    const model = buildTranscriptModel([
      header(),
      user("u1", null),
      assistant("m1", "u1", [
        call("t1", "read"),
        { type: "text", text: "中间回答" },
        call("t2", "write"),
      ]),
    ]);
    expect(model.turns[0].items.map((item) => item.kind)).toEqual(["group", "text", "group"]);
  });

  it("被弃分支数只挂在首个 Turn 上（Recap 标注不重复）", () => {
    const model = buildTranscriptModel([
      header(),
      user("u1", null),
      assistant("a1", "u1", [text("old")]),
      user("u2", "u1"),
      assistant("a2", "u2", [text("new")]),
    ]);
    expect(model.turns[0].abandonedCount).toBe(1);
    expect(model.turns[1].abandonedCount).toBeUndefined();
  });
});

describe("buildTranscriptModel · Recap 结算事实（ADR-0013）", () => {
  it("每组一条 recap：工具数、思考数、失败数", () => {
    const model = buildTranscriptModel([
      header(),
      user("u1", null),
      assistant("m1", "u1", [thinking("想"), call("t1", "read"), call("t2", "bash")]),
      toolResult("r1", "m1", "t1", "read"),
      {
        type: "message",
        id: "r2",
        parentId: "r1",
        timestamp: TS,
        message: { role: "toolResult", toolCallId: "t2", toolName: "bash", content: [{ type: "text", text: "boom" }], isError: true },
      },
    ]);
    const group = model.turns[0].items[0];
    // running / toolCounts / startedAt 是 TUI Mode 的运行态派生量（ADR-0014），随 recap 一并结算
    expect(group.kind === "group" && group.recap).toEqual({
      tools: 2,
      thoughts: 1,
      failed: 1,
      running: false,
      toolCounts: [
        { name: "read", count: 1 },
        { name: "bash", count: 1 },
      ],
      startedAt: Date.parse(TS),
    });
  });

  it("纯思考组的结算时长兜底 assistant.durationMs（无工具调用时头部不空白，ADR-0014 迭代）", () => {
    const model = buildTranscriptModel([
      header(),
      user("u1", null),
      assistant("m1", "u1", [thinking("想")], { durationMs: 4200 }),
    ]);
    const group = model.turns[0].items[0];
    expect(group.kind === "group" && group.recap).toMatchObject({
      tools: 0,
      thoughts: 1,
      failed: 0,
      running: false,
      toolCounts: [],
      durationMs: 4200,
    });
  });

  it("分类计数同名累加、保持首次出现序；组内存在无配对结果的调用即 running", () => {
    const model = buildTranscriptModel([
      header(),
      user("u1", null),
      assistant("m1", "u1", [call("t1", "bash"), call("t2", "read"), call("t3", "bash"), call("t4", "read")]),
      toolResult("r1", "m1", "t1", "bash"),
      toolResult("r2", "r1", "t2", "read"),
      // t3 / t4 无配对结果：running
    ]);
    const group = model.turns[0].items[0];
    expect(group.kind === "group" && group.recap).toMatchObject({
      running: true,
      toolCounts: [
        { name: "bash", count: 2 },
        { name: "read", count: 2 },
      ],
    });
  });

  it("耗时 = 本轮末条目 − user 条目；tokens 取 assistant.usage 累加", () => {
    const model = buildTranscriptModel([
      { type: "session", id: "s1", parentId: null, timestamp: "2026-01-01T00:00:00.000Z", version: 3 },
      { type: "message", id: "u1", parentId: null, timestamp: "2026-01-01T00:00:00.000Z", message: { role: "user", content: "hi" } },
      {
        type: "message",
        id: "m1",
        parentId: "u1",
        timestamp: "2026-01-01T00:00:03.000Z",
        message: {
          role: "assistant",
          content: [text("done")],
          usage: { totalTokens: 1500 },
        },
      },
      {
        type: "message",
        id: "m2",
        parentId: "m1",
        timestamp: "2026-01-01T00:00:05.000Z",
        message: { role: "assistant", content: [text("more")], usage: { totalTokens: 500 } },
      },
    ]);
    expect(model.turns[0].durationMs).toBe(5000);
    expect(model.turns[0].tokens).toBe(2000);
  });

  it("内核没给耗时/tokens 时留空，不发明数据（本地 session 无 usage 的常态）", () => {
    const model = buildTranscriptModel([
      header(),
      user("u1", null),
      assistant("m1", "u1", [text("x"), call("t1", "read")]),
    ]);
    // 所有条目同一时刻：耗时为 0，不写成负值也不写成字段
    expect(model.turns[0].durationMs).toBeUndefined();
    expect(model.turns[0].tokens).toBeUndefined();
  });
});

describe("buildTranscriptModel · diff / patch / oldText 三种来源（ADR-0013）", () => {
  const editResult = (details: unknown): SessionEntry => ({
    type: "message",
    id: "r1",
    parentId: "m1",
    timestamp: TS,
    message: { role: "toolResult", toolCallId: "t1", toolName: "edit", content: [{ type: "text", text: "ok" }], details },
  });

  it("details.diff 与 details.patch 同时提取，优先序交给 edit-diff", () => {
    const model = buildTranscriptModel([
      header(),
      user("u1", null),
      assistant("m1", "u1", [{ type: "toolCall", id: "t1", name: "edit", arguments: {} }]),
      editResult({ diff: " 1 keep\n-2 old\n+2 new", patch: "--- a\n+++ b\n@@ -1 +1 @@\n-old\n+new" }),
    ]);
    const item = model.turns[0].items[0];
    const call = item.kind === "group" ? item.group[0] : undefined;
    expect(call?.kind === "toolCall" && call.diff).toBe(" 1 keep\n-2 old\n+2 new");
    expect(call?.kind === "toolCall" && call.patch).toContain("@@ -1 +1 @@");
  });

  it("只有 patch 时仍可兜底（内核没产出 diff 的历史会话）", () => {
    const model = buildTranscriptModel([
      header(),
      user("u1", null),
      assistant("m1", "u1", [{ type: "toolCall", id: "t1", name: "edit", arguments: {} }]),
      editResult({ patch: "@@ -1 +1 @@\n-old\n+new" }),
    ]);
    const item = model.turns[0].items[0];
    const call = item.kind === "group" ? item.group[0] : undefined;
    expect(call?.kind === "toolCall" && call.diff).toBeUndefined();
    expect(call?.kind === "toolCall" && call.patch).toContain("-old");
  });

  it("历史形态的 edits[].oldText/newText 与顶层 oldText/newText 都兼容", () => {
    const modelWithEdits = buildTranscriptModel([
      header(),
      user("u1", null),
      assistant("m1", "u1", [
        { type: "toolCall", id: "t1", name: "edit", arguments: { edits: [{ oldText: "a", newText: "b" }, { oldText: "c", newText: "d" }] } },
      ]),
    ]);
    const groupItem = modelWithEdits.turns[0].items[0];
    const call = groupItem.kind === "group" ? groupItem.group[0] : undefined;
    expect(call?.kind === "toolCall" && call.requested).toEqual([
      { oldText: "a", newText: "b" },
      { oldText: "c", newText: "d" },
    ]);

    const modelWithTop = buildTranscriptModel([
      header(),
      user("u1", null),
      assistant("m1", "u1", [{ type: "toolCall", id: "t1", name: "edit", arguments: { oldText: "x", newText: "y" } }]),
    ]);
    const g2 = modelWithTop.turns[0].items[0];
    const c2 = g2.kind === "group" ? g2.group[0] : undefined;
    expect(c2?.kind === "toolCall" && c2.requested).toEqual([{ oldText: "x", newText: "y" }]);
  });

  it("非 edit 工具不产生 requested（不误吞其它工具的 oldText 字段）", () => {
    const model = buildTranscriptModel([
      header(),
      user("u1", null),
      assistant("m1", "u1", [{ type: "toolCall", id: "t1", name: "bash", arguments: { command: "ls" } }]),
    ]);
    const item = model.turns[0].items[0];
    const call = item.kind === "group" ? item.group[0] : undefined;
    expect(call?.kind === "toolCall" && call.requested).toBeUndefined();
  });
});

describe("buildTranscriptModel · Draft 与落盘条目（ADR-0013）", () => {
  it("末条 assistant 停在 pending 即标 draft；定稿后标记消失", () => {
    const entries = [
      header(),
      user("u1", null),
      { type: "message", id: "m1", parentId: "u1", timestamp: TS, message: { role: "assistant", content: [text("打字中")], stopReason: "pending" } },
    ];
    expect(buildTranscriptModel(entries as SessionEntry[]).turns[0].draft).toBe(true);

    const done = entries.map((e, i) =>
      i === 2 ? { ...e, message: { ...(e as { message: object }).message, stopReason: "stop" } } : e,
    );
    expect(buildTranscriptModel(done as SessionEntry[]).turns[0].draft).toBeUndefined();
  });

  it("paused 期间的中间 assistant 也是 pending 时不误判（只有末条算）", () => {
    const model = buildTranscriptModel([
      header(),
      user("u1", null),
      { type: "message", id: "m1", parentId: "u1", timestamp: TS, message: { role: "assistant", content: [text("中途")], stopReason: "pending" } },
      { type: "message", id: "m2", parentId: "m1", timestamp: TS, message: { role: "assistant", content: [text("定稿")], stopReason: "stop" } },
    ]);
    expect(model.turns[0].draft).toBeUndefined();
  });
});

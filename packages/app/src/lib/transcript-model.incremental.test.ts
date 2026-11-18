/** C6 增量等价契约：同一序列下，增量续算与全量重建的产出深度一致。
 *  buildTranscriptModel 是模块级单槽缓存——本文件的用例故意共享缓存槽，
 *  按真实流式时序（append / 尾部换帧 / 分支切换 / 入参内容折叠）逐帧推进并逐帧比对。 */
import { describe, expect, it } from "vitest";
import type { SessionEntry } from "@pi-studio/shared/pi-types";
import { buildTranscriptModel, turnGroupAt, type LiveTools } from "./transcript-model";

const TS = "2026-01-01T00:00:00.000Z";

const user = (id: string, parentId: string | null, text = `问题 ${id}`): SessionEntry => ({
  type: "message",
  id,
  parentId,
  timestamp: TS,
  message: { role: "user", content: text },
});

const assistant = (id: string, parentId: string, blocks: SessionEntry extends never ? never : any[]): SessionEntry =>
  ({
    type: "message",
    id,
    parentId,
    timestamp: TS,
    message: { role: "assistant", content: blocks, stopReason: "stop" },
  }) as SessionEntry;

const toolResult = (id: string, parentId: string, toolCallId: string, isError = false): SessionEntry => ({
  type: "message",
  id,
  parentId,
  timestamp: TS,
  message: { role: "toolResult", toolCallId, content: [{ type: "text", text: `输出 ${id}` }], isError },
});

const header: SessionEntry = { type: "session", version: 3, id: "s0", parentId: null, timestamp: TS, cwd: "/p" };

/** 流式帧合成（driven-view 同款）：基线 + 待回显 + 换了正文的草稿 */
function frame(base: SessionEntry[], pending: string, draftText: string, live?: LiveTools): SessionEntry[] {
  const leaf = base[base.length - 1]?.id ?? null;
  return [
    ...base,
    {
      type: "message",
      id: "pp",
      parentId: leaf,
      timestamp: new Date(1000).toISOString(),
      message: { role: "user", content: pending },
    },
    {
      type: "message",
      id: "draft",
      parentId: "pp",
      timestamp: new Date(1001).toISOString(),
      message: { role: "assistant", content: [{ type: "text", text: draftText }], stopReason: "pending" },
    },
    ...(live ? [] : []),
  ];
}

describe("增量等价：append / 尾部换帧 / 分支切换", () => {
  it("权威条目逐条 append：每一步与全量重建深度一致", () => {
    const full: SessionEntry[] = [
      header,
      user("u1", null),
      assistant("a1", "u1", [{ type: "thinking", thinking: "想" }, { type: "toolCall", id: "t1", name: "bash", arguments: { command: "ls" } }]),
      toolResult("r1", "a1", "t1"),
      assistant("a2", "r1", [{ type: "text", text: "回答" }]),
      user("u2", "a2"),
      assistant("a3", "u2", [{ type: "text", text: "第二轮" }]),
    ];
    // 逐帧增长推进缓存槽
    for (let end = 0; end <= full.length; end++) {
      const incremental = buildTranscriptModel(full.slice(0, end));
      const ground = buildTranscriptModel(full.slice(0, end)); // 同引用快路径 + 内容一致
      expect(incremental).toEqual(ground);
    }
    const incremental = buildTranscriptModel(full);
    expect(incremental).toEqual(buildTranscriptModel([...full]));
    expect(turnGroupAt(incremental, 0, 0)?.recap.tools).toBe(1);
  });

  it("流式时序：pending 出现 → 草稿逐帧增长 → 权威条目落盘，每帧与全量一致", () => {
    const base: SessionEntry[] = [header, user("u1", null), assistant("a1", "u1", [{ type: "text", text: "第一轮" }])];
    // 幀 1：基线
    let expected = buildTranscriptModel([...base]);
    expect(buildTranscriptModel([...base])).toEqual(expected);
    // 幀 2-4：待回显 + 草稿打字机（尾部换帧，数组共享前缀但尾对象换新）
    for (const draft of ["你", "你好", "你好呀"]) {
      const frameEntries = frame(base, "新问题", draft);
      expected = buildTranscriptModel([...frameEntries]);
      expect(buildTranscriptModel(frameEntries)).toEqual(expected);
      expect(expected.turns.at(-1)?.draft).toBe(true);
    }
    // 幀 5：权威条目落盘（pending/draft 让位）——liveTools 无关帧
    const settled: SessionEntry[] = [
      ...base,
      user("u2", "a1", "新问题"),
      assistant("a2", "u2", [{ type: "text", text: "你好呀" }]),
    ];
    expected = buildTranscriptModel([...settled]);
    expect(buildTranscriptModel(settled)).toEqual(expected);
    expect(expected.turns).toHaveLength(2);
    expect(expected.turns[1].draft).toBeUndefined();
  });

  it("分支切换（历史重挂 parent）：增量判据失效自动回全量，产出一致", () => {
    // 先建立缓存：线性会话
    const base: SessionEntry[] = [header, user("u1", null), assistant("a1", "u1", [{ type: "text", text: "v1" }])];
    buildTranscriptModel([...base]);
    // 分支：u2 改挂 u1，a1 变被弃；尾部追加不满足线性延展（u2 的 parent 是 u1 而非链尾 a1）
    const branched: SessionEntry[] = [...base, user("u2", "u1"), assistant("a2", "u2", [{ type: "text", text: "v2" }])];
    const got = buildTranscriptModel([...branched]);
    expect(got.abandonedCount).toBe(1);
    expect(got.turns.map((turn) => turn.id)).toEqual(["u1", "u2"]);
    expect(got).toEqual(buildTranscriptModel([...branched]));
    // 反向：链尾追加也允许（u3 挂 a2）
    const longer: SessionEntry[] = [...branched, user("u3", "a2")];
    expect(buildTranscriptModel([...longer]).turns.map((turn) => turn.id)).toEqual(["u1", "u2", "u3"]);
  });

  it("liveTools 内容同值折叠：换引用不换内容不失效，内容变化全量重算注入尾巴", () => {
    const base: SessionEntry[] = [
      header,
      user("u1", null),
      assistant("a1", "u1", [{ type: "toolCall", id: "t1", name: "bash", arguments: { command: "yes" } }]),
    ];
    const liveA: LiveTools = { t1: { outputTail: "load", totalLen: 10 } };
    const liveB: LiveTools = { t1: { outputTail: "load", totalLen: 10 } }; // 内容同值，引用不同
    const first = buildTranscriptModel([...base], liveA);
    const second = buildTranscriptModel([...base], liveB);
    expect(second).toEqual(first);
    // 内容变化：尾巴刷新进 running 条目
    const liveC: LiveTools = { t1: { outputTail: "loading more", totalLen: 20 } };
    const third = buildTranscriptModel([...base], liveC);
    expect(turnGroupAt(third, 0, 0)?.group[0]).toMatchObject({
      state: "running",
      live: { outputTail: "loading more", totalLen: 20 },
    });
  });

  it("收缩与清空：数组缩短（截尾）同样收敛到全量结果", () => {
    const full: SessionEntry[] = [
      header,
      user("u1", null),
      assistant("a1", "u1", [{ type: "text", text: "回答" }]),
      user("u2", "a1"),
      assistant("a2", "u2", [{ type: "text", text: "二轮" }]),
    ];
    buildTranscriptModel([...full]);
    const shrunk = full.slice(0, 3);
    expect(buildTranscriptModel([...shrunk]).turns.map((turn) => turn.id)).toEqual(["u1"]);
    expect(buildTranscriptModel([]).turns).toEqual([]);
  });
});

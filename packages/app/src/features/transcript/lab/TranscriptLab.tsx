/** Transcript Lab（ADR-0013 静态样张）：**走真实渲染路径**。
 *
 * 这里没有复刻组件——mock 产出真实 SessionEntry，经 buildTranscriptModel
 * 得到 TranscriptModel，再由 TurnView / ToolRow 渲染。样张验证的就是线上代码：
 * 分组边界、四态判定、嵌套调用、代码块几何全部在真实路径上算出。
 * TUI 运行态样张（ADR-0014）同理走真实 TuiGroup，固定 TUI 形态不随全局配置。
 */
import { useMemo, type ReactNode } from "react";
import type { SessionEntry } from "@pi-studio/shared/pi-types";
import { buildTranscriptModel } from "../../../lib/transcript-model";
import { useLocale } from "../../../state/useLocale";
import { Icon } from "../../../components/Icon";
import { AnnotationRow } from "../AnnotationRow";
import { Markdown } from "../Markdown";
import { TuiGroup } from "../TuiGroup";
import { TurnView } from "../TurnView";
import {
  MOCK_ASSISTANT_TEXT,
  MOCK_STATE_TURN,
  MOCK_TURNS,
  mockEntriesFor,
  type MockTurn,
} from "./mock-transcript";
import styles from "./lab.module.css";
import transcriptStyles from "../transcript.module.css";

function Sample({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.sample}>
      <p className={styles.sampleLabel}>{label}</p>
      {children}
    </div>
  );
}

/** 一个 mock turn → 真实模型 → 真实 TurnView */
function TurnSample({ turn }: { turn: MockTurn }) {
  const { t } = useLocale();
  const model = useMemo(() => buildTranscriptModel(mockEntriesFor(turn)), [turn]);

  return (
    <Sample label={t(turn.label)}>
      {model.turns.map((parsed) => (
        <TurnView key={parsed.id} turn={parsed} />
      ))}
      {model.orphanAnnotations.map((entry) => (
        <AnnotationRow key={entry.id} entry={entry} />
      ))}
    </Sample>
  );
}

export function TranscriptLab() {
  const { t } = useLocale();
  // 四态样张复用同一套渲染路径，只是 mock 数据不同
  const states = useMemo(() => buildTranscriptModel(mockEntriesFor(MOCK_STATE_TURN)), []);
  // TUI 运行态样张（ADR-0014）：一个已结算调用 + 一个运行中调用（无配对结果即 running），
  // liveTools 注入输出尾巴——正是驱动路径的实时形状；时间戳取挂钟近期，秒数会真实跳动
  const tuiLive = useMemo(() => {
    const startedAt = new Date(Date.now() - 12_000).toISOString();
    const settledAt = new Date(Date.now() - 11_000).toISOString();
    const entries: SessionEntry[] = [
      {
        type: "message",
        id: "u1",
        parentId: null,
        timestamp: new Date(Date.now() - 13_000).toISOString(),
        message: { role: "user", content: "跑一下测试" },
      },
      {
        type: "message",
        id: "a1",
        parentId: "u1",
        timestamp: startedAt,
        // durationMs（内核请求耗时）：完成思考行据此显示耗时
        message: {
          role: "assistant",
          durationMs: 3200,
          content: [
            {
              type: "thinking",
              thinking:
                "The user asks for today's GitHub trending projects. Note the date discrepancy — 先确认测试文件，再跑一轮确认时间线没有遗漏。",
            },
            { type: "toolCall", id: "t1", name: "read", arguments: { path: "packages/app/src/lib/x.ts" } },
            { type: "toolCall", id: "t2", name: "bash", arguments: { command: "pnpm vitest run" } },
          ],
        },
      },
      {
        type: "message",
        id: "r1",
        parentId: "a1",
        timestamp: settledAt,
        message: {
          role: "toolResult",
          toolCallId: "t1",
          toolName: "read",
          content: [{ type: "text", text: "export function refreshSession(token: string) {" }],
          isError: false,
          durationMs: 820,
        },
      },
      // t2 无配对结果：running；其后追加一条思考流式中——
      // 紧凑态亮「最后一个活动条目」，活跃思考行亮 spinner + 秒数 + 尾部滚动
      // （ADR-0014）；文本含段间空行，覆盖尾部滚动的多段与空行滤除路径
      {
        type: "message",
        id: "a2",
        parentId: "r1",
        timestamp: new Date(Date.now() - 2_000).toISOString(),
        message: {
          role: "assistant",
          content: [
            {
              type: "thinking",
              thinking:
                "测试都过了，接下来汇总结论。\n\n先检查一下 web_search 的结果是否覆盖了今天的头条新闻，重点看 AI 工具类项目的排名变化；再决定要不要补充一轮检索确认时间线没有遗漏，尤其是今天新上榜的项目与热度曲线的口径是否一致。",
            },
          ],
        },
      },
    ];
    return buildTranscriptModel(entries, {
      t2: { outputTail: "PASS  src/lib/x.test.ts\n  ✓ renders (12ms)\n  ✓ keeps draft on leaf (5ms)\n", totalLen: 45210 },
    });
  }, []);

  return (
    <div className={styles.lab}>
      {MOCK_TURNS.map((turn) => (
        <TurnSample key={turn.id} turn={turn} />
      ))}

      <Sample label={t("labCodeBlock")}>
        <Markdown>{MOCK_ASSISTANT_TEXT}</Markdown>
      </Sample>

      <Sample label={t("transcriptStates")}>
        {states.turns.map((parsed) => (
          <TurnView key={parsed.id} turn={parsed} />
        ))}
      </Sample>

      <Sample label={t("labTuiLive")}>
        {tuiLive.turns.map((parsed) =>
          parsed.items.map((item) =>
            item.kind === "group" ? (
              // mock 是正在运行的会话：live 直通（真路径上由末轮 live 派生），
              // 组后无正文条目，isTurnTail 恒真
              <TuiGroup key={item.id} group={item.group} recap={item.recap} live isTurnTail />
            ) : null,
          ),
        )}
      </Sample>

      <Sample label={t("labEmpty")}>
        <div className={transcriptStyles.emptyState}>
          <Icon name="sparkles" size={28} />
          <strong>{t("emptyBranchTitle")}</strong>
          <span>{t("emptyBranchHint")}</span>
        </div>
      </Sample>
    </div>
  );
}

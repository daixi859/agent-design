/** Transcript Lab（ADR-0013 静态样张）：**走真实渲染路径**。
 *
 * 这里没有复刻组件——mock 产出真实 SessionEntry，经 buildTranscriptModel
 * 得到 TranscriptModel，再由 TurnView / ToolRow 渲染。样张验证的就是线上代码：
 * 分组边界、四态判定、嵌套调用、代码块几何全部在真实路径上算出。
 */
import { useMemo, type ReactNode } from "react";
import { buildTranscriptModel } from "../../../lib/transcript-model";
import { useLocale } from "../../../state/useLocale";
import { Icon } from "../../../ui/Icon";
import { AnnotationRow } from "../AnnotationRow";
import { Markdown } from "../Markdown";
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

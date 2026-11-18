/** Queue Dock（GLOSSARY）：输入框上方的队列区（ADR-0017）。Steer / Follow-up
    待送内容与本地待确认发送混排的单一列表；多条折叠为计数头，编辑时自动展开。
    行内动作仅三种——插话（提升为 Steer，非运行态禁用）、编辑（行内）、删除——
    全部经整批重编落内核（ADR-0016：clearQueue + 按新列表逐条重入）。 */
import { useState, type KeyboardEvent } from "react";
import type { QueuedItem } from "../../state/use-drive";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { translateVars } from "../../lib/i18n";
import { cx } from "../../lib/cx";
import { useLocale } from "../../state/useLocale";
import styles from "./transcript.module.css";

export interface QueueRow extends QueuedItem {
  /** 本地待确认发送（内核 queue 快照未回）：动作禁用，文案走「送出中」 */
  pending?: boolean;
}

export function QueueDock({
  rows,
  running,
  onRebuild,
}: {
  rows: QueueRow[];
  /** 运行态（running / retrying）：「插话」动作的可用性依据 */
  running: boolean;
  onRebuild(items: QueuedItem[]): void;
}) {
  const { locale, t } = useLocale();
  const [collapsed, setCollapsed] = useState(true);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState("");

  if (rows.length === 0) return null;

  const rebuild = (next: QueueRow[]) => {
    onRebuild(next.map(({ text, channel }) => ({ text, channel })));
    // 无本地乐观更新：clearQueue 的空快照会先回推、逐条重入队后再回填——
    // 短暂的空窗是 ADR-0016 明示接受的竞态代价，不在这里伪造状态
  };

  const saveEdit = () => {
    if (editing === null) return;
    const text = draft.trim();
    setEditing(null);
    setDraft("");
    if (!text) return;
    const next = rows.map((row, index) => (index === editing ? { ...row, text } : row));
    rebuild(next);
  };

  const editRow = (index: number) => {
    setCollapsed(false);
    setEditing(index);
    setDraft(rows[index].text);
  };

  const promote = (index: number) => {
    rebuild(rows.map((row, i) => (i === index ? { ...row, channel: "steer" as const } : row)));
  };

  const remove = (index: number) => {
    rebuild(rows.filter((_, i) => i !== index));
    setEditing(null);
  };

  const editorKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      saveEdit();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setEditing(null);
    }
  };

  const expanded = rows.length === 1 || !collapsed || editing !== null;

  return (
    <div className={styles.queueDock}>
      {!expanded && (
        <button type="button" className={styles.queueHead} onClick={() => setCollapsed(false)}>
          {translateVars(locale, "queueCount", { n: String(rows.length) })}
          <Icon name="chevron-down" size={10} />
        </button>
      )}
      {expanded &&
        rows.map((row, index) =>
          editing === index ? (
            <div key={`edit-${index}`} className={styles.queueRow}>
              <textarea
                className={cx(styles.queueEditor)}
                value={draft}
                autoFocus
                rows={2}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={editorKeyDown}
              />
              <div className={styles.queueActions}>
                <Button className={styles.queueAction} icon="check" iconSize={11} onClick={saveEdit}>
                  {t("queueSave")}
                </Button>
                <Button
                  className={styles.queueAction}
                  onClick={() => {
                    setEditing(null);
                    setDraft("");
                  }}
                >
                  {t("queueCancel")}
                </Button>
              </div>
            </div>
          ) : (
            <div key={`${index}-${row.text}`} className={styles.queueRow}>
              <span
                className={cx(
                  styles.queueTag,
                  row.channel === "steer" ? styles.queueTagSteer : styles.queueTagFollow,
                )}
              >
                {row.pending ? t("queuePending") : row.channel === "steer" ? t("steerTag") : t("followUpTag")}
              </span>
              <span className={styles.queueText}>{row.text}</span>
              <span className={styles.queueActions}>
                <Button
                  className={styles.queueAction}
                  icon="arrow-up"
                  iconSize={11}
                  title={t("steerNowHint")}
                  disabled={row.pending || !running}
                  onClick={() => promote(index)}
                >
                  {t("steerNow")}
                </Button>
                <Button
                  className={styles.queueAction}
                  icon="pencil"
                  iconSize={11}
                  title={t("queueEdit")}
                  aria-label={t("queueEdit")}
                  disabled={row.pending}
                  onClick={() => editRow(index)}
                />
                <Button
                  className={styles.queueAction}
                  icon="xmark"
                  iconSize={11}
                  title={t("queueRemove")}
                  aria-label={t("queueRemove")}
                  disabled={row.pending}
                  onClick={() => remove(index)}
                />
              </span>
            </div>
          ),
        )}
    </div>
  );
}

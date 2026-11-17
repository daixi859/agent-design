/** 用户消息渲染（右侧气泡，DSH 几何；ADR-0006 后 assistant 文本并入 Turn 结构）。
    entry.timestamp 是 ISO 字符串（pi 语义：entry 级时间戳），这里渲染为时钟。 */
import type { MessageEntry, UserMessage } from "@pi-studio/shared/pi-types";
import { contentBlocks } from "@pi-studio/shared/message-text";
import { Icon } from "../../components/Icon";
import { formatClock } from "../../lib/format";
import { useLocale } from "../../state/useLocale";
import styles from "./transcript.module.css";

export function UserMessageView({ entry }: { entry: MessageEntry }) {
  const message = entry.message as UserMessage;
  const blocks = contentBlocks(message.content);
  const { t } = useLocale();
  // entry.timestamp 一定是 ISO；解析失败就不渲染时间行，而不是显示 "Invalid Date"
  const clock = Number.isFinite(Date.parse(entry.timestamp)) ? formatClock(entry.timestamp) : undefined;

  return (
    <div className={styles.userRow}>
      <div className={styles.userStack}>
        <div className={styles.userBubble}>
          {blocks.map((block, index) =>
            block.type === "text" ? (
              <span key={index}>{block.text}</span>
            ) : block.type === "image" ? (
              <img
                key={index}
                src={`data:${block.mimeType ?? "image/png"};base64,${block.data ?? ""}`}
                alt={t("attachedImage")}
              />
            ) : null,
          )}
        </div>
        {clock && (
          <span className={styles.userMeta}>
            <Icon name="clock" size={11} />
            {clock}
          </span>
        )}
      </div>
    </div>
  );
}

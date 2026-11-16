/** 用户消息渲染（iMessage 式右侧气泡）；assistant 文本已并入 Turn 结构（ADR-0006） */
import type { MessageEntry, UserMessage } from "../../../shared/pi-types";
import { contentBlocks } from "../../../shared/message-text";
import styles from "./transcript.module.css";

export function UserMessageView({ entry }: { entry: MessageEntry }) {
  const message = entry.message as UserMessage;
  const blocks = contentBlocks(message.content);
  return (
    <div className={styles.userRow}>
      <div className={styles.userBubble}>
        {blocks.map((block, index) =>
          block.type === "text" ? (
            <span key={index}>{block.text}</span>
          ) : block.type === "image" ? (
            <img
              key={index}
              src={`data:${block.mimeType ?? "image/png"};base64,${block.data ?? ""}`}
              alt="attached image"
            />
          ) : null,
        )}
      </div>
    </div>
  );
}

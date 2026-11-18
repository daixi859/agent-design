/** 用户消息渲染（右侧气泡，DSH 几何；ADR-0006 后 assistant 文本并入 Turn 结构）。
    显示形状由模型层归一（C5：UserMessageDisplay，wire 的 MessageEntry 不出接口）——
    只拿 text / image 显示块与条目级时间戳。 */
import type { UserMessageDisplay } from "../../lib/transcript-model";
import { Icon } from "../../components/Icon";
import { formatClock } from "../../lib/format";
import { useLocale } from "../../state/use-locale";
import styles from "./transcript.module.css";

export function UserMessageView({ message }: { message: UserMessageDisplay }) {
  const { t, locale } = useLocale();
  // entry.timestamp 一定是 ISO；解析失败就不渲染时间行，而不是显示 "Invalid Date"
  // （formatClock 内部判定；locale 版修复——原实现硬编码 en，中文界面也显 PM）
  const clock = formatClock(message.timestamp, locale);

  return (
    <div className={styles.userRow}>
      <div className={styles.userStack}>
        <div className={styles.userBubble}>
          {message.parts.map((part, index) =>
            part.kind === "text" ? (
              <span key={index}>{part.text}</span>
            ) : part.kind === "image" ? (
              <img
                key={index}
                src={`data:${part.mimeType ?? "image/png"};base64,${part.data ?? ""}`}
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

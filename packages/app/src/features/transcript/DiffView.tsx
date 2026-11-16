/** Unified diff 渲染（edit 工具的 details.diff / patch，Q14） */
import styles from "./transcript.module.css";

interface DiffLine {
  type: "add" | "del" | "ctx" | "hunk" | "file" | "skip";
  text: string;
}

function parseDiff(diff: string): DiffLine[] {
  return diff.split("\n").map((line) => {
    if (line.startsWith("diff --git ")) return { type: "file", text: line };
    if (
      line.startsWith("@@") ||
      line.startsWith("@ ")
    )
      return { type: "hunk", text: line };
    if (
      line.startsWith("index ") ||
      line.startsWith("--- ") ||
      line.startsWith("+++ ") ||
      line.startsWith("new file mode") ||
      line.startsWith("deleted file mode")
    )
      return { type: "skip", text: line };
    if (line.startsWith("+")) return { type: "add", text: line.slice(1) };
    if (line.startsWith("-")) return { type: "del", text: line.slice(1) };
    return { type: "ctx", text: line.startsWith(" ") ? line.slice(1) : line };
  });
}

const gutter: Record<DiffLine["type"], string> = {
  add: "+",
  del: "−",
  ctx: "",
  hunk: "",
  file: "",
  skip: "",
};

export function DiffView({ diff }: { diff: string }) {
  const lines = parseDiff(diff);
  return (
    <div className={`scroll-y ${styles.diff}`}>
      {lines.map((line, index) => {
        if (line.type === "file") {
          return (
            <div key={index} className={styles.diffFile}>
              {line.text}
            </div>
          );
        }
        if (line.type === "skip") return null;
        const rowClass =
          line.type === "add"
            ? styles.diffAdd
            : line.type === "del"
              ? styles.diffDel
              : line.type === "hunk"
                ? styles.diffHunk
                : undefined;
        return (
          <div
            key={index}
            className={rowClass ? `${styles.diffRow} ${rowClass}` : styles.diffRow}
          >
            <span className={styles.diffGutter}>{gutter[line.type]}</span>
            <span>{line.text}</span>
          </div>
        );
      })}
    </div>
  );
}

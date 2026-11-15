/** Preview（组件清单，ADR-0009 并入设置壳）：本项目的全部 UI 资产验收页——
    图标全网格、控件与徽标、色板、字阶、消息样张。样式直接引用各组件的
    module.css 源头，保证预览即真实组件而非复刻。 */
import { useState } from "react";
import type { ContentBlock, MessageEntry, ToolResultMessage } from "../../shared/pi-types";
import type { Turn } from "../lib/session-model";
import { AnnotationRow } from "../features/transcript/AnnotationRow";
import { Composer } from "../features/transcript/Composer";
import { DiffView } from "../features/transcript/DiffView";
import { TurnView } from "../features/transcript/TurnView";
import { IconButton } from "../ui/IconButton";
import { SearchField } from "../ui/SearchField";
import { Icon, ICON_NAMES } from "../ui/Icon";
import { cx } from "../lib/cx";
import { useLocale } from "../state/useLocale";
import sessionBar from "../features/sessionbar/session-bar.module.css";
import settings from "../features/settings/settings.module.css";
import styles from "./gallery.module.css";

const SURFACES: Array<[string, string]> = [
  ["canvas", "var(--bg-canvas)"],
  ["sidebar", "var(--bg-sidebar)"],
  ["elevated", "var(--bg-elevated)"],
  ["inset", "var(--bg-inset)"],
  ["accent", "var(--accent)"],
  ["accent-subtle", "var(--accent-subtle)"],
  ["thinking", "var(--thinking)"],
  ["success", "var(--success)"],
  ["warning", "var(--warning)"],
  ["danger", "var(--danger)"],
  ["text-1", "var(--text-1)"],
  ["text-2", "var(--text-2)"],
  ["text-3", "var(--text-3)"],
  ["text-4", "var(--text-4)"],
  ["separator", "var(--separator)"],
];

const TYPE_SAMPLES: Array<[string, string, string]> = [
  ["caption2", "11px", "0123456789 The quick brown fox"],
  ["caption", "12px", "Model switched to deepseek-v4.1-flash"],
  ["footnote", "13px", "Fix the login redirect loop in auth/session.ts"],
  ["body", "14px", "Assistant text reads at document size for long transcripts."],
  ["callout", "15px", "Callout: larger notes stand out when needed."],
  ["title3", "17px", "Session summary heading"],
  ["title2", "20px", "Pi Studio"],
];

const SAMPLE_DIFF = `diff --git a/src/auth/session.ts b/src/auth/session.ts
index 3f2a1b..9c4d2e 100644
--- a/src/auth/session.ts
+++ b/src/auth/session.ts
@@ -12,7 +12,9 @@ export async function refreshSession(token: string) {
   const payload = await verify(token)
-  if (!payload.sub) throw new Error("invalid token")
+  if (!payload.sub) {
+    throw new AuthError("invalid token", { cause: token.slice(0, 8) })
+  }
   return extendSession(payload.sub)
 }`;

function entry(role: MessageEntry["message"]["role"], content: ContentBlock[]): MessageEntry {
  return {
    type: "message",
    id: Math.random().toString(16).slice(2),
    parentId: null,
    timestamp: new Date().toISOString(),
    message: { role, content } as MessageEntry["message"],
  };
}

const SAMPLE_EDIT_RESULT: ToolResultMessage = {
  role: "toolResult",
  toolCallId: "call-1",
  toolName: "edit",
  isError: false,
  content: [{ type: "text", text: "Edited 1 file" }],
  details: { diff: SAMPLE_DIFF, patch: SAMPLE_DIFF, firstChangedLine: 14 },
};

/** 三层结构样张（ADR-0006）：分组（思考+edit）→ 回答 */
const SAMPLE_TURN: Turn = {
  id: "sample-turn",
  user: entry("user", [
    { type: "text", text: "登录之后一直重定向回 /login，帮我查一下 session 刷新的逻辑" },
  ]),
  items: [
    {
      kind: "group",
      id: "sample-group-1",
      group: [
        {
          kind: "thinking",
          id: "sample-think-1",
          thinking:
            "The redirect loop likely comes from the guard reading a stale cookie. Plan: inspect session.ts refresh path first, then the login route.",
        },
        {
          kind: "toolCall",
          id: "call-1",
          call: { type: "toolCall", id: "call-1", name: "edit", arguments: { path: "src/auth/session.ts", edits: [] } },
          result: SAMPLE_EDIT_RESULT,
        },
      ],
    },
    {
      kind: "text",
      id: "sample-text-1",
      text: "找到了根因：`refreshSession` 在 cookie 过期后仍复用旧 token。修复如下：\n\n```ts\nif (!payload.sub) {\n  throw new AuthError(\"invalid token\")\n}\n```\n\n- 新增 `AuthError` 便于上游区分\n- 登录路由不再静默续期\n\n详见下面的 diff。",
    },
  ],
};

export function ComponentGallery() {
  const [search, setSearch] = useState("");
  const { t } = useLocale();

  return (
    <div className={`scroll-y ${styles.gallery}`}>
      <div className={styles.inner}>
        <section>
          <h2 className={styles.sectionTitle}>{t("iconography")}</h2>
          <p className={styles.sectionNote}>{t("iconographyNote")}</p>
          <div className={styles.iconGrid}>
            {ICON_NAMES.map((name) => (
              <figure key={name} className={styles.iconCell}>
                <Icon name={name} size={20} />
                <figcaption>{name}</figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section>
          <h2 className={styles.sectionTitle}>{t("controlsBadge")}</h2>
          <p className={styles.sectionNote}>{t("controlsNote")}</p>
          <div className={styles.row}>
            <IconButton icon="panel-left" title={t("toggleSidebar")} />
            <IconButton icon="plus" title={t("newSession")} />
            <IconButton icon="gear" title={t("settings")} />
            <IconButton icon="sun" title={t("toggleTheme")} />
            <SearchField value={search} onChange={setSearch} placeholder={t("search")} />
            <span
              className={sessionBar.branchedBadge}
              title={t("branchedTitle")}
            >
              <Icon name="branch" size={11} />
              {t("branched")}
            </span>
          </div>
          <div className={styles.row} role="group" aria-label="Segmented sample">
            <div className={settings.segmented}>
              {[t("light"), t("dark")].map((label, index) => (
                <button
                  key={label}
                  type="button"
                  className={cx(settings.segment, index === 0 && settings.segmentActive)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section>
          <h2 className={styles.sectionTitle}>{t("surfaces")}</h2>
          <p className={styles.sectionNote}>{t("surfacesNote")}</p>
          <div className={styles.swatches}>
            {SURFACES.map(([name, variable]) => (
              <figure key={name} className={styles.swatch}>
                <div style={{ background: variable }} />
                <span>{name}</span>
              </figure>
            ))}
          </div>
        </section>

        <section>
          <h2 className={styles.sectionTitle}>{t("typeRamp")}</h2>
          <p className={styles.sectionNote}>{t("typeRampNote")}</p>
          <div className={styles.typeRamp}>
            {TYPE_SAMPLES.map(([token, size, text]) => (
              <div key={token}>
                <span style={{ fontSize: size }}>{text}</span>
                <em>
                  --text-{token} · {size}
                </em>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className={styles.sectionTitle}>{t("transcriptSamples")}</h2>
          <p className={styles.sectionNote}>{t("transcriptNote")}</p>
          <div className={styles.sampleFrame}>
            <TurnView turn={SAMPLE_TURN} />
            <AnnotationRow
              entry={{
                type: "compaction",
                id: "anno-1",
                parentId: null,
                timestamp: new Date().toISOString(),
                tokensBefore: 128000,
              }}
            />
            <Composer
              model="deepseek-v4.1-flash"
              thinkingLevel="max"
              toolCount={7}
              variant="docked"
            />
          </div>
        </section>

        <section>
          <h2 className={styles.sectionTitle}>{t("diff")}</h2>
          <p className={styles.sectionNote}>{t("diffNote")}</p>
          <DiffView diff={SAMPLE_DIFF} />
        </section>
      </div>
    </div>
  );
}

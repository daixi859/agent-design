/** Model Seat（GLOSSARY）：底栏的模型与 thinking 档位选择控件对（ADR-0017）。
    两粒按钮各开 popover（MenuSurface，锚上方）；模型列表带搜索（>8 条）；
    输入冻结期保持可用——卡住时换模型再发是它的恢复手势语义，拒绝走
    commandFailed（错误条见 SessionView）。切换仅会话级（ADR-0016）。 */
import { useEffect, useRef, useState, type RefObject } from "react";
import { THINKING_LEVEL_ORDER, type SessionCatalog } from "@pi-studio/shared/protocol";
import { Icon } from "../../components/Icon";
import { MenuSurface } from "../../components/MenuSurface";
import { cx } from "../../lib/cx";
import type { MessageKey } from "../../lib/i18n";
import { useLocale } from "../../state/useLocale";
import barStyles from "./transcript.module.css";
import menuStyles from "../../components/menu-surface.module.css";

/** 未知档位值在正典序里排最后 */
const LADDER: readonly string[] = THINKING_LEVEL_ORDER;

/** 档位描述（pi TUI 同源口径：off = 无推理，minimal ≈1k …） */
const THINK_DESC: Record<string, MessageKey> = {
  off: "thinkDescOff",
  minimal: "thinkDescMinimal",
  low: "thinkDescLow",
  medium: "thinkDescMedium",
  high: "thinkDescHigh",
  xhigh: "thinkDescXhigh",
  max: "thinkDescMax",
};

export function ModelSeat({
  catalog,
  current,
  thinkingLevel,
  anchorRef,
  onSetModel,
  onSetThinkingLevel,
}: {
  catalog?: SessionCatalog;
  /** 当前选中（entries 派生优先，catalog.current 兜底——切换后 entries 先更新） */
  current?: { provider?: string; modelId?: string };
  /** 当前档位（同上口径） */
  thinkingLevel?: string;
  /** popover 的锚（composer 卡）：与卡同宽对齐 */
  anchorRef: RefObject<HTMLElement | null>;
  onSetModel(provider: string, modelId: string): void;
  onSetThinkingLevel(level: string): void;
}) {
  const { t } = useLocale();
  const [menu, setMenu] = useState<"model" | "thinking" | null>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [search, setSearch] = useState("");
  // 目录可达上千项：打开模型菜单时把当前选中滚进视口，否则 ✓ 藏在深处等于没有
  const currentRowRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (menu === "model") currentRowRef.current?.scrollIntoView({ block: "center" });
  }, [menu]);

  const models = catalog?.model?.models ?? [];
  const showSearch = models.length > 8;
  const query = search.trim().toLowerCase();
  const filtered = query
    ? models.filter(
        (m) => m.modelId.toLowerCase().includes(query) || (m.name ?? "").toLowerCase().includes(query),
      )
    : models;
  const multiProvider = new Set(models.map((m) => m.provider)).size > 1;

  // 当前模型的可用档位：目录中该模型的 thinkingLevels；目录缺该模型时退正典全集
  const currentEntry = models.find(
    (m) => m.provider === current?.provider && m.modelId === current?.modelId,
  );
  const levels = (currentEntry?.thinkingLevels ?? LADDER)
    .slice()
    .sort((a, b) => LADDER.indexOf(a) - LADDER.indexOf(b));
  const currentLevel = thinkingLevel ?? catalog?.model?.thinkingLevel;

  const open = (which: "model" | "thinking") => {
    setAnchor(anchorRef.current?.getBoundingClientRect() ?? null);
    setSearch("");
    setMenu(which);
  };

  return (
    <>
      <button
        type="button"
        className={barStyles.seatButton}
        title={t("model")}
        disabled={models.length === 0}
        aria-haspopup="listbox"
        aria-expanded={menu === "model"}
        onClick={() => open("model")}
      >
        <Icon name="sparkles" size={11} />
        <span className={barStyles.seatLabel}>{current?.modelId ?? t("model")}</span>
        <Icon name="chevron-down" size={9} />
      </button>
      <button
        type="button"
        className={cx(barStyles.seatButton, levels.includes("off") && levels.length === 1 && barStyles.seatMuted)}
        title={t("thinkingLevel")}
        disabled={models.length === 0}
        aria-haspopup="listbox"
        aria-expanded={menu === "thinking"}
        onClick={() => open("thinking")}
      >
        <span className={barStyles.seatLabel}>{currentLevel ?? t("thinkingLevel")}</span>
        <Icon name="chevron-down" size={9} />
      </button>

      {menu !== null && anchor && (
        <MenuSurface
          anchor={anchor}
          anchorEl={anchorRef.current}
          placement="top"
          maxHeight={320}
          onClose={() => setMenu(null)}
          ariaLabel={menu === "model" ? t("model") : t("thinkingLevel")}
        >
          {menu === "model" ? (
            <div role="listbox" aria-label={t("model")}>
              {showSearch && (
                <input
                  className={menuStyles.search}
                  placeholder={t("search")}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              )}
              {filtered.length === 0 && <div className={menuStyles.empty}>{t("menuEmpty")}</div>}
              {filtered.map((entry) => {
                const isCurrent = entry.provider === current?.provider && entry.modelId === current?.modelId;
                return (
                  <button
                    type="button"
                    key={`${entry.provider}/${entry.modelId}`}
                    ref={isCurrent ? currentRowRef : undefined}
                    role="option"
                    aria-selected={isCurrent}
                    className={menuStyles.item}
                    onClick={() => {
                      onSetModel(entry.provider, entry.modelId);
                      setMenu(null);
                    }}
                  >
                    <span className={menuStyles.itemBody}>
                      <span className={menuStyles.itemTitle}>
                        {entry.name ?? entry.modelId}
                        {(entry.name ?? entry.modelId) !== entry.modelId && (
                          <span className={menuStyles.itemHint}>{entry.modelId}</span>
                        )}
                      </span>
                      {multiProvider && <span className={menuStyles.itemDesc}>{entry.provider}</span>}
                    </span>
                    {isCurrent && (
                      <span className={menuStyles.itemCheck}>
                        <Icon name="check" size={12} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div role="listbox" aria-label={t("thinkingLevel")}>
              {levels.map((level) => {
                const isCurrent = level === currentLevel;
                const descKey = THINK_DESC[level];
                return (
                  <button
                    type="button"
                    key={level}
                    role="option"
                    aria-selected={isCurrent}
                    className={menuStyles.item}
                    onClick={() => {
                      onSetThinkingLevel(level);
                      setMenu(null);
                    }}
                  >
                    <span className={menuStyles.itemBody}>
                      <span className={menuStyles.itemTitle}>{level}</span>
                      {descKey && <span className={menuStyles.itemDesc}>{t(descKey)}</span>}
                    </span>
                    {isCurrent && (
                      <span className={menuStyles.itemCheck}>
                        <Icon name="check" size={12} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </MenuSurface>
      )}
    </>
  );
}

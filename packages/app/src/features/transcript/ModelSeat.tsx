/** Model Seat（GLOSSARY）：底栏的模型与 thinking 档位选择控件对（ADR-0017）。
    两粒按钮各包一个 MenuSurface（锚在各自按钮上方）；模型列表按服务商分组
    （ADR-0016，只列已添加服务商），带搜索（>8 条）；
    输入冻结期保持可用——卡住时换模型再发是它的恢复手势语义，拒绝走
    commandFailed（错误条见 SessionView）。切换仅会话级（ADR-0016）。 */
import { useEffect, useRef, useState } from "react";
import { THINKING_LEVEL_ORDER, type ModelCatalogEntry, type SessionCatalog } from "@pi-studio/shared/protocol";
import { Icon } from "../../components/Icon";
import { MenuSurface, MenuSurfaceGroup, MenuSurfaceItem } from "../../components/MenuSurface";
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
  disabled: forcedDisabled,
  disabledHint,
  onSetModel,
  onSetThinkingLevel,
}: {
  catalog?: SessionCatalog;
  /** 当前选中（entries 派生优先，catalog.current 兜底——切换后 entries 先更新） */
  current?: { provider?: string; modelId?: string };
  /** 当前档位（同上口径） */
  thinkingLevel?: string;
  /** 恒禁（他属驱动 / 不可驱动）：选择无兑付路径——区别于目录缺席的自动禁 */
  disabled?: boolean;
  /** 恒禁时的提示（已翻译串，如他属驱动的 drivenByOtherHint）；缺省退只读提示 */
  disabledHint?: string;
  onSetModel(provider: string, modelId: string): void;
  onSetThinkingLevel(level: string): void;
}) {
  const { t } = useLocale();
  const [menu, setMenu] = useState<"model" | "thinking" | null>(null);
  const [search, setSearch] = useState("");
  // 目录可达上千项：打开模型菜单时把当前选中滚进视口，否则 ✓ 藏在深处等于没有
  const currentRowRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (menu === "model") currentRowRef.current?.scrollIntoView({ block: "center" });
  }, [menu]);

  const close = () => setMenu(null);
  const open = (which: "model" | "thinking") => {
    // 再点同钮即收（MenuSurface 把触发钮让出外点判定，toggle 由这里补）；换钮则切菜单
    setMenu(menu === which ? null : which);
    setSearch("");
  };

  const models = catalog?.model?.models ?? [];
  // 恒禁（他属驱动 / 不可驱动）或目录缺席（首次浏览）：两粒按钮都退只读展示
  const seatDisabled = Boolean(forcedDisabled) || models.length === 0;
  // 禁用态的提示：他属驱动用传入的 disabledHint，其余退只读提示（接管后可切换）
  const seatHint = disabledHint ?? t("seatReadOnlyHint");
  const showSearch = models.length > 8;
  const query = search.trim().toLowerCase();
  const filtered = query
    ? models.filter(
        (m) =>
          m.modelId.toLowerCase().includes(query) ||
          (m.name ?? "").toLowerCase().includes(query) ||
          (m.providerName ?? m.provider).toLowerCase().includes(query),
      )
    : models;
  // 按服务商分组（ADR-0016「provider 分组的模型列表」）：保持目录首现顺序，搜索后空组自然隐藏
  const groups: { provider: string; name: string; entries: ModelCatalogEntry[] }[] = [];
  for (const entry of filtered) {
    const group = groups.find((g) => g.provider === entry.provider);
    if (group) group.entries.push(entry);
    else groups.push({ provider: entry.provider, name: entry.providerName ?? entry.provider, entries: [entry] });
  }

  // 当前模型的可用档位：目录中该模型的 thinkingLevels；目录缺该模型时退正典全集
  const currentEntry = models.find(
    (m) => m.provider === current?.provider && m.modelId === current?.modelId,
  );
  const levels = (currentEntry?.thinkingLevels ?? LADDER)
    .slice()
    .sort((a, b) => LADDER.indexOf(a) - LADDER.indexOf(b));
  const currentLevel = thinkingLevel ?? catalog?.model?.thinkingLevel;

  return (
    <>
      <MenuSurface<HTMLButtonElement>
        open={menu === "model"}
        onClose={close}
        placement="top"
        maxHeight={320}
        ariaLabel={t("model")}
        trigger={(anchorRef) => (
          <button
            ref={anchorRef}
            type="button"
            className={barStyles.seatButton}
            title={seatDisabled ? seatHint : t("model")}
            disabled={seatDisabled}
            aria-haspopup="listbox"
            aria-expanded={menu === "model"}
            onClick={() => open("model")}
          >
            <Icon name="sparkles" size={11} />
            <span className={barStyles.seatLabel}>{current?.modelId ?? t("model")}</span>
            <Icon name="chevron-down" size={9} />
          </button>
        )}
      >
        <div role="listbox" aria-label={t("model")}>
          {showSearch && (
            <input
              className={menuStyles.search}
              placeholder={t("search")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          )}
          {groups.length === 0 && <div className={menuStyles.empty}>{t("menuEmpty")}</div>}
          {groups.map((group) => (
            <MenuSurfaceGroup key={group.provider} label={group.name}>
              {group.entries.map((entry) => {
                const isCurrent = entry.provider === current?.provider && entry.modelId === current?.modelId;
                return (
              <MenuSurfaceItem
                key={`${entry.provider}/${entry.modelId}`}
                role="option"
                selected={isCurrent}
                ref={isCurrent ? currentRowRef : undefined}
                onClick={() => {
                  onSetModel(entry.provider, entry.modelId);
                  setMenu(null);
                }}
                trailing={isCurrent ? <Icon name="check" size={12} /> : undefined}
              >
                    <span className={menuStyles.itemTitle}>
                      {entry.name ?? entry.modelId}
                      {entry.supportsImages && (
                        <span className={menuStyles.itemFlag} title={t("modelImageInput")}>
                          <Icon name="image" size={13} />
                        </span>
                      )}
                    </span>
                  </MenuSurfaceItem>
                );
              })}
            </MenuSurfaceGroup>
          ))}
        </div>
      </MenuSurface>

      <MenuSurface<HTMLButtonElement>
        open={menu === "thinking"}
        onClose={close}
        placement="top"
        ariaLabel={t("thinkingLevel")}
        trigger={(anchorRef) => (
          <button
            ref={anchorRef}
            type="button"
            className={cx(barStyles.seatButton, levels.includes("off") && levels.length === 1 && barStyles.seatMuted)}
            title={seatDisabled ? seatHint : t("thinkingLevel")}
            disabled={seatDisabled}
            aria-haspopup="listbox"
            aria-expanded={menu === "thinking"}
            onClick={() => open("thinking")}
          >
            <span className={barStyles.seatLabel}>{currentLevel ?? t("thinkingLevel")}</span>
            <Icon name="chevron-down" size={9} />
          </button>
        )}
      >
        <div role="listbox" aria-label={t("thinkingLevel")}>
          {levels.map((level) => {
            const isCurrent = level === currentLevel;
            const descKey = THINK_DESC[level];
            return (
              <MenuSurfaceItem
                key={level}
                role="option"
                selected={isCurrent}
                onClick={() => {
                  onSetThinkingLevel(level);
                  setMenu(null);
                }}
              >
                <span className={menuStyles.itemTitle}>{level}</span>
                {descKey && <span className={menuStyles.itemDesc}>{t(descKey)}</span>}
              </MenuSurfaceItem>
            );
          })}
        </div>
      </MenuSurface>
    </>
  );
}

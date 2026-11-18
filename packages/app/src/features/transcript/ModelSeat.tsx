/** Model Seat（GLOSSARY）：底栏的模型与 thinking 档位选择控件对（ADR-0017）。
    两粒按钮各包一个 SelectMenu（标准选择器）；模型列表按服务商分组（ADR-0016，只列
    已添加服务商），带搜索（>8 条），行普通字号，图片输入以「视觉」Tag 标注；
    thinking 菜单只列档位名；图片输入以「视觉」Tag 紧随模型名（badge 插槽，✓ 仍独占
    行尾）。addon 插槽渲染在控件对之前（Composer 的命令插入 + 领衔底栏，ADR-0017）。
    输入冻结期保持可用——卡住时换模型再发是它的恢复手势语义，拒绝走
    commandFailed（错误条见 SessionView）。切换仅会话级（ADR-0016）。 */
import { THINKING_LEVEL_ORDER, type ModelCatalogEntry, type SessionCatalog } from "@pi-studio/shared/protocol";
import type { ReactNode, RefObject } from "react";
import { Icon } from "../../components/Icon";
import { SelectMenu, type SelectGroup } from "../../components/SelectMenu";
import { Tag } from "../../components/Tag";
import { cx } from "../../lib/cx";
import type { MessageKey } from "../../lib/i18n";
import { useLocale } from "../../state/useLocale";
import barStyles from "./transcript.module.css";

/** 未知档位值在正典序里排最后 */
const LADDER: readonly string[] = THINKING_LEVEL_ORDER;

export function ModelSeat({
  catalog,
  current,
  thinkingLevel,
  disabled: forcedDisabled,
  disabledHint,
  onSetModel,
  onSetThinkingLevel,
  addon,
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
  /** 控件对之前的插槽（命令插入 + 等） */
  addon?: ReactNode;
}) {
  const { t } = useLocale();

  const models = catalog?.model?.models ?? [];
  // 恒禁（他属驱动 / 不可驱动）或目录缺席（首次浏览且全局目录未达）：退只读展示
  const seatDisabled = Boolean(forcedDisabled) || models.length === 0;
  const seatHint = disabledHint ?? t("seatReadOnlyHint");

  // 按服务商分组（ADR-0016「provider 分组的模型列表」）：保持目录首现顺序
  const groups: { provider: string; name: string; entries: ModelCatalogEntry[] }[] = [];
  for (const entry of models) {
    const group = groups.find((g) => g.provider === entry.provider);
    if (group) group.entries.push(entry);
    else groups.push({ provider: entry.provider, name: entry.providerName ?? entry.provider, entries: [entry] });
  }
  /** 选项标识 → (provider, modelId)：modelId 含特殊字符也安全，不用分隔串反解 */
  const optionKey = (entry: ModelCatalogEntry) => `${entry.provider}/${entry.modelId}`;
  const byKey = new Map(models.map((entry) => [optionKey(entry), entry]));
  const modelGroups: SelectGroup[] = groups.map((group) => ({
    label: group.name,
    options: group.entries.map((entry) => ({
      value: optionKey(entry),
      label: entry.name ?? entry.modelId,
      // 搜索口径（ADR-0016）：名称、模型 id 与服务商名一起匹配
      searchText: [entry.name, entry.modelId, entry.providerName ?? entry.provider]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
      ...(entry.supportsImages
        ? { badge: <Tag title={t("modelImageInput")}>{t("visualTag")}</Tag> }
        : {}),
    })),
  }));
  const modelValue = current?.provider && current?.modelId ? `${current.provider}/${current.modelId}` : undefined;

  // 当前模型的可用档位：目录中该模型的 thinkingLevels；目录缺该模型时退正典全集
  const currentEntry = models.find(
    (m) => m.provider === current?.provider && m.modelId === current?.modelId,
  );
  const levels = (currentEntry?.thinkingLevels ?? LADDER)
    .slice()
    .sort((a, b) => LADDER.indexOf(a) - LADDER.indexOf(b));
  const currentLevel = thinkingLevel ?? catalog?.model?.thinkingLevel;

  const renderSeatTrigger = (
    label: ReactNode,
    labelKey: MessageKey,
    anchorRef: RefObject<HTMLButtonElement | null>,
    open: boolean,
    toggle: () => void,
    muted = false,
  ) => (
    <button
      ref={anchorRef}
      type="button"
      className={cx(barStyles.seatButton, muted && barStyles.seatMuted)}
      title={seatDisabled ? seatHint : t(labelKey)}
      disabled={seatDisabled}
      aria-haspopup="listbox"
      aria-expanded={open}
      onClick={toggle}
    >
      {label}
      <Icon name="chevron-down" size={9} />
    </button>
  );

  return (
    <>
      {addon}

      <SelectMenu<HTMLButtonElement>
        value={modelValue}
        groups={modelGroups}
        onChange={(value) => {
          const entry = byKey.get(value);
          if (entry) onSetModel(entry.provider, entry.modelId);
        }}
        ariaLabel={t("model")}
        maxHeight={320}
        searchable={models.length > 8}
        searchPlaceholder={t("search")}
        emptyText={t("menuEmpty")}
        trigger={(anchorRef, open, toggle) =>
          renderSeatTrigger(
            <>
              <Icon name="sparkles" size={11} />
              <span className={barStyles.seatLabel}>{current?.modelId ?? t("model")}</span>
            </>,
            "model",
            anchorRef,
            open,
            toggle,
          )
        }
      />

      <SelectMenu<HTMLButtonElement>
        value={currentLevel}
        groups={[
          {
            options: levels.map((level) => ({ value: level, label: level })),
          },
        ]}
        onChange={onSetThinkingLevel}
        ariaLabel={t("thinkingLevel")}
        trigger={(anchorRef, open, toggle) =>
          renderSeatTrigger(
            <span className={barStyles.seatLabel}>{currentLevel ?? t("thinkingLevel")}</span>,
            "thinkingLevel",
            anchorRef,
            open,
            toggle,
            // 仅剩 off 一档（模型不可调档）时弱化展示（既有视觉语义）
            levels.length === 1 && levels[0] === "off",
          )
        }
      />
    </>
  );
}

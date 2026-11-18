/** SelectMenu：标准选择器（Base Component，见 GLOSSARY）——传入分组选项与当前值，
 *  onChange 回调选择。消费方只供数据、触发钮渲染与界面文案（本组件不做 i18n），
 *  列表语义（搜索 / 分组头 / 普通字号行 / ✓ 选中标记 / 当前项滚进视口）在此定型；
 *  表面与定位由 MenuSurface 承载（锚在触发钮旁，placement 可调）。 */
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Icon } from "./Icon";
import { MenuSurface, MenuSurfaceGroup, MenuSurfaceItem } from "./MenuSurface";
import menuStyles from "./menu-surface.module.css";

/** 单个选项：value 为选中回传的标识；searchText 为搜索匹配文本（缺省退 label
 *  字符串 / value）——服务商展示名等不在行内出现的内容经它参与搜索；badge 紧随
 *  名称（Tag 之类），trailing 装行尾徽标（✓ 与消费方行尾内容共享侧位） */
export interface SelectOption {
  value: string;
  label: ReactNode;
  searchText?: string;
  badge?: ReactNode;
  trailing?: ReactNode;
}

export interface SelectGroup {
  /** 分组头文案；缺省为无头组（选项直排） */
  label?: string;
  options: SelectOption[];
}

export function SelectMenu<E extends HTMLElement = HTMLElement>({
  value,
  groups,
  onChange,
  trigger,
  ariaLabel,
  placement = "top",
  matchAnchorWidth = false,
  maxHeight = 320,
  searchable = false,
  searchPlaceholder,
  emptyText,
}: {
  /** 当前选中（options 里匹配不上的行不标 ✓——乐观覆盖期的中间态允许暂缺） */
  value?: string;
  groups: SelectGroup[];
  onChange(value: string): void;
  /** 触发钮由消费方渲染：toggle 切换开关（再点同钮即收） */
  trigger(anchorRef: RefObject<E | null>, open: boolean, toggle: () => void): ReactNode;
  ariaLabel: string;
  placement?: "top" | "bottom";
  matchAnchorWidth?: boolean;
  maxHeight?: number;
  /** 开搜索框（长列表自便；按 label / value 文本包含过滤） */
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const currentRowRef = useRef<HTMLButtonElement | null>(null);

  // 打开瞬间把当前选中滚进视口（否则 ✓ 藏在深处等于没有）
  useEffect(() => {
    if (open) currentRowRef.current?.scrollIntoView({ block: "center" });
  }, [open]);

  const toggle = () => {
    setOpen(!open);
    setSearch("");
  };
  const close = () => setOpen(false);

  const query = search.trim().toLowerCase();
  const match = (option: SelectOption) =>
    !query ||
    (option.searchText ?? (typeof option.label === "string" ? option.label : option.value))
      .toLowerCase()
      .includes(query);
  const visibleGroups = query ? groups.map((group) => ({ ...group, options: group.options.filter(match) })) : groups;
  const count = visibleGroups.reduce((total, group) => total + group.options.length, 0);

  return (
    <MenuSurface<E>
      open={open}
      onClose={close}
      placement={placement}
      matchAnchorWidth={matchAnchorWidth}
      maxHeight={maxHeight}
      ariaLabel={ariaLabel}
      trigger={(anchorRef) => trigger(anchorRef, open, toggle)}
    >
      <div role="listbox" aria-label={ariaLabel}>
        {searchable && (
          <input
            className={menuStyles.search}
            placeholder={searchPlaceholder}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        )}
        {count === 0 && <div className={menuStyles.empty}>{emptyText}</div>}
        {visibleGroups.map((group, index) => {
          const options = group.options.map((option) => {
            const isCurrent = option.value === value;
            return (
              <MenuSurfaceItem
                key={option.value}
                role="option"
                selected={isCurrent}
                ref={isCurrent ? currentRowRef : undefined}
                onClick={() => {
                  onChange(option.value);
                  close();
                }}
                trailing={
                  isCurrent || option.trailing != null ? (
                    <>
                      {isCurrent && <Icon name="check" size={12} />}
                      {option.trailing}
                    </>
                  ) : undefined
                }
              >
                {option.label}
                {option.badge != null && <span className={menuStyles.itemBadge}>{option.badge}</span>}
              </MenuSurfaceItem>
            );
          });
          return group.label ? (
            <MenuSurfaceGroup key={group.label ?? index} label={group.label}>
              {options}
            </MenuSurfaceGroup>
          ) : (
            options
          );
        })}
      </div>
    </MenuSurface>
  );
}

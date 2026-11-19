/** DSH 组件预览（Settings · DSH Components 分区）：把 deepseek-harness
    ui-primitives 的基础组件按**真实结构 + 真实样式**静态移植过来——每个 .tsx 样张的
    DOM 与上游组件一致，每个 module.css 直接来自上游同名文件（--dsw- 命名空间改写为
    --dsh-），只去掉需要运行时坐标/计时的部分（浮层定位、计时淡出、键盘漫游）。

    这里不是为了交互，而是为了在同一张令牌快照下逐件看样式：一旦上游改版，重新抄一遍
    对应 module.css 即可，样张结构也照上游 JSX 走。令牌见 styles/tokens.dsh.css。 */
import type { CSSProperties, ReactNode } from "react";
import { useLocale } from "../state/use-locale";
import { Icon } from "../components/Icon";
import styles from "./dsh-components.module.css";
import "../styles/tokens.dsh.css";
import button from "./dsh-components/styles/button.module.css";
import sw from "./dsh-components/styles/switch.module.css";
import checkbox from "./dsh-components/styles/checkbox.module.css";
import segmented from "./dsh-components/styles/segmentedcontrol.module.css";
import tabs from "./dsh-components/styles/segmentedtabs.module.css";
import tag from "./dsh-components/styles/tag.module.css";
import pill from "./dsh-components/styles/pill.module.css";
import input from "./dsh-components/styles/input.module.css";
import keys from "./dsh-components/styles/shortcutkeys.module.css";
import path from "./dsh-components/styles/pathlabel.module.css";
import dot from "./dsh-components/styles/statedot.module.css";
import disclosure from "./dsh-components/styles/disclosurerow.module.css";
import tooltip from "./dsh-components/styles/tooltip.module.css";
import hovercard from "./dsh-components/styles/hovercard.module.css";
import menu from "./dsh-components/styles/menu.module.css";
import menuSurface from "./dsh-components/styles/menusurface.module.css";
import modal from "./dsh-components/styles/modal.module.css";
import toast from "./dsh-components/styles/toast.module.css";
import codeCard from "./dsh-components/styles/codecard.module.css";
import terminal from "./dsh-components/styles/terminalblock.module.css";
import read from "./dsh-components/styles/readblock.module.css";
import diff from "./dsh-components/styles/diffblock.module.css";
import search from "./dsh-components/styles/searchblock.module.css";
import web from "./dsh-components/styles/webblock.module.css";
import bubble from "./dsh-components/styles/usermessagebubble.module.css";

/** CodeCard 正文样张：源文件里不写裸换行，多行代码放在模板字符串里 */
const CODE_SAMPLE = `export function attach(id: string) {
  lease.acquire(id);
  socket.send({ type: 'attach', id });
}`;

/** 一件样张：标题 + 说明 + 舞台。舞台底色用 DSH 的 bg-base，让「浮在上面」的组件
    看到的是它自己的表面，而不是本项目的暖纸画布。 */
function Sample({
  label,
  note,
  children,
  stage,
}: {
  label: string;
  note?: string;
  children: ReactNode;
  stage?: "plain" | "surface" | "material";
}) {
  return (
    <section className={styles.sample}>
      <h3 className={styles.sampleLabel}>{label}</h3>
      {note !== undefined && <p className={styles.sampleNote}>{note}</p>}
      <div className={styles.stage} data-stage={stage ?? "plain"}>
        {children}
      </div>
    </section>
  );
}

/** 键盘快捷键：上游 ShortcutKeys；`tooltip` 变体才画深底键帽，菜单与行内提示用无键帽形态 */
function Shortcut({ combo, tooltip = false }: { combo: readonly string[]; tooltip?: boolean }) {
  return (
    <span className={tooltip ? `${keys.keys} ${keys.tooltip}` : keys.keys}>
      {combo.map((key, index) => (
        <span key={key} className={tooltip ? keys.joined : undefined}>
          {index > 0 && <span className={keys.separator}>+</span>}
          <span className={keys.key}>{key}</span>
        </span>
      ))}
    </span>
  );
}

export function DshComponents() {
  const { t } = useLocale();

  return (
    <div className={`scroll-y ${styles.page}`}>
      <div className={styles.inner}>
        <p className={styles.intro}>{t("dshComponentsNote")}</p>

        {/* ---------------- 基础控件 ---------------- */}
        <section>
          <h2 className={styles.sectionTitle}>{t("dshAtoms")}</h2>
          <p className={styles.sectionNote}>{t("dshAtomsNote")}</p>

          <Sample label="Button" note="ghost / primary / outline / toolbar · md 36px 与 sm 28px">
            <div className={styles.row}>
              {(["ghost", "primary", "outline", "toolbar"] as const).map((variant) => (
                <button key={variant} type="button" className={`${button.button} ${button.md} ${button[variant]}`}>
                  {t("dshButtonContinue")}
                </button>
              ))}
            </div>
            <div className={styles.row}>
              {(["ghost", "primary", "outline", "toolbar"] as const).map((variant) => (
                <button key={variant} type="button" className={`${button.button} ${button.sm} ${button[variant]}`}>
                  {t("dshButtonRetry")}
                </button>
              ))}
              <button type="button" className={`${button.button} ${button.md} ${button.ghost}`} disabled>
                {t("dshButtonDisabled")}
              </button>
            </div>
            <div className={styles.row}>
              <button type="button" className={`${button.button} ${button.md} ${button.primary}`}>
                <span className={button.icon}>
                  <Icon name="check" size={16} />
                </span>
                {t("dshButtonContinue")}
              </button>
              <button type="button" className={`${button.button} ${button.md} ${button.ghost}`} title={t("toggleTheme")}>
                <span className={button.icon}>
                  <Icon name="sun" size={16} />
                </span>
              </button>
            </div>
          </Sample>

          <Sample label="Switch" note="36×20 · 关态拇指恒亮（浅色主题下也是亮块）">
            <div className={styles.row}>
              <span className={`${sw.switch}`} role="switch" aria-checked="true" aria-label={t("dshSwitchOn")}>
                <span className={sw.thumb} />
              </span>
              <span className={styles.inlineLabel}>{t("dshSwitchOn")}</span>
              <span className={sw.switch} role="switch" aria-checked="false" aria-label={t("dshSwitchOff")}>
                <span className={sw.thumb} />
              </span>
              <span className={styles.inlineLabel}>{t("dshSwitchOff")}</span>
              <span className={sw.switch} role="switch" aria-checked="true" aria-label={t("dshSwitchLocked")} aria-disabled="true">
                <span className={sw.thumb} />
              </span>
              <span className={styles.inlineLabel}>{t("dshSwitchLocked")}</span>
            </div>
          </Sample>

          <Sample label="Checkbox" note="原生 checkbox + accent-color 取品牌色">
            <div className={styles.row}>
              <label className={checkbox.checkbox}>
                <input type="checkbox" defaultChecked readOnly />
                <span>{t("dshCheckboxOn")}</span>
              </label>
              <label className={checkbox.checkbox}>
                <input type="checkbox" readOnly />
                <span>{t("dshCheckboxOff")}</span>
              </label>
              <label className={checkbox.checkbox}>
                <input type="checkbox" defaultChecked disabled readOnly />
                <span>{t("dshCheckboxLocked")}</span>
              </label>
            </div>
          </Sample>

          <Sample label="SegmentedControl" note="等宽段落 + 一枚滑动指示条（两段 / 三段）">
            <div className={styles.row}>
              <div className={segmented.control} role="tablist" aria-label={t("dshSegmentedLabel")}>
                <span className={segmented.indicator} aria-hidden="true" />
                <button type="button" role="tab" aria-selected="true" className={segmented.tab}>
                  {t("dshSegmentStandard")}
                </button>
                <button type="button" role="tab" aria-selected="false" className={segmented.tab}>
                  {t("dshSegmentTui")}
                </button>
              </div>
              <div
                className={segmented.control}
                role="tablist"
                aria-label={t("dshSegmentedLabel")}
                style={{ "--dsh-segment-count": 3, "--dsh-segment-index": 1 } as CSSProperties}
              >
                <span className={segmented.indicator} aria-hidden="true" />
                <button type="button" role="tab" aria-selected="false" className={segmented.tab}>
                  {t("dshSegmentStandard")}
                </button>
                <button type="button" role="tab" aria-selected="true" className={segmented.tab}>
                  {t("dshSegmentAuto")}
                </button>
                <button type="button" role="tab" aria-selected="false" className={segmented.tab}>
                  {t("dshSegmentTui")}
                </button>
              </div>
            </div>
          </Sample>

          <Sample label="SegmentedTabs" note="md 42px（4px 内距）/ sm 34px（2px 内距），标签即 Pill">
            <div className={styles.tabColumn}>
              <div
                className={tabs.tabs}
                role="tablist"
                aria-label={t("dshTabsLabel")}
                style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}
              >
                <span
                  className={tabs.indicator}
                  aria-hidden="true"
                  style={{ width: "calc((100% - 2 * var(--segmented-tabs-inset)) / 3)", transform: "translateX(0%)" }}
                />
                {[t("dshTabGeneral"), t("dshTabModels"), t("dshTabAdvanced")].map((label, index) => (
                  <button
                    key={label}
                    type="button"
                    role="tab"
                    aria-selected={index === 0}
                    className={`${pill.pill} ${tabs.tab}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div
                className={tabs.tabs}
                data-size="sm"
                role="tablist"
                aria-label={t("dshTabsLabel")}
                style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}
              >
                <span
                  className={tabs.indicator}
                  aria-hidden="true"
                  style={{ width: "calc((100% - 2 * var(--segmented-tabs-inset)) / 3)", transform: "translateX(100%)" }}
                />
                {[t("dshTabGeneral"), t("dshTabModels"), t("dshTabAdvanced")].map((label, index) => (
                  <button
                    key={label}
                    type="button"
                    role="tab"
                    aria-selected={index === 1}
                    className={`${pill.pill} ${tabs.tab}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </Sample>

          <Sample label="Pill / Tag" note="Pill 24px 可选胶囊（active 才有描边）；Tag 11px 只读徽标、八种色板">
            <div className={styles.row}>
              <span className={`${pill.pill} ${pill.active}`}>{t("dshPillActive")}</span>
              <span className={pill.pill}>{t("dshPillIdle")}</span>
              <span className={pill.pill}>
                <Icon name="branch" size={12} />
                {t("dshPillIdle")}
              </span>
            </div>
            <div className={styles.row}>
              {(["outline", "solid", "neutral", "quiet", "success", "info", "warning", "danger"] as const).map((tone) => (
                <span key={tone} className={tag.tag} data-tone={tone}>
                  {tone}
                </span>
              ))}
            </div>
          </Sample>

          <Sample label="Input" note="32px 高 · 前置图标槽 · 聚焦态换业务色描边">
            <div className={styles.row}>
              <span className={input.wrap}>
                <span className={input.icon}>
                  <Icon name="search" size={16} />
                </span>
                <input className={input.input} placeholder={t("dshInputPlaceholder")} />
              </span>
              <span className={input.wrap}>
                <input className={input.input} defaultValue="drive-client" />
              </span>
            </div>
          </Sample>

          <Sample label="ShortcutKeys" note="行内提示（无键帽）/ tooltip 变体（深底键帽）">
            <div className={styles.row}>
              <span className={keys.keys}>
                <span className={keys.key}>⌘</span>
                <span className={keys.separator}>+</span>
                <span className={keys.key}>K</span>
              </span>
              <Shortcut combo={["⌘", "⇧", "P"]} tooltip />
            </div>
          </Sample>

          <Sample label="PathLabel" note="目录弱化、文件名强调，溢出时保留文件名（左缘渐隐）">
            <div className={styles.pathRow}>
              <div className={path.path}>
                <span className={path.text}>
                  <span className={path.directory}>packages\app\src\lib\</span>
                  <span className={path.name}>pi-client.ts</span>
                </span>
              </div>
            </div>
            <div className={styles.pathRow}>
              <div className={path.path} data-path-clipped="">
                <span className={path.text}>
                  <span className={path.directory}>/srv/projects/very-long-directory-name/another/nested/path/to/</span>
                  <span className={path.name}>terminal-block.tsx</span>
                </span>
              </div>
            </div>
          </Sample>

          <Sample label="StateDot" note="done / warning / error / idle 实心点 · ongoing 旋转环 · step 实心勾">
            <div className={styles.row}>
              {(["done", "warning", "error", "idle"] as const).map((state) => (
                <span key={state} className={styles.dotCell}>
                  <span className={dot.dot} data-state={state} style={{ width: 10, height: 10 }} />
                  {state}
                </span>
              ))}
              <span className={styles.dotCell}>
                <svg className={dot.spinner} data-state="ongoing" width={14} height={14} viewBox="0 0 24 24" aria-hidden="true">
                  <g className={dot.spinnerMotion}>
                    <circle className={dot.spinnerTrack} cx="12" cy="12" r="9.5" />
                    <circle className={dot.spinnerArc} cx="12" cy="12" r="9.5" />
                  </g>
                </svg>
                ongoing
              </span>
              <span className={styles.dotCell}>
                <span className={dot.step} data-state="done" style={{ width: 14, height: 14 }}>
                  <Icon name="check" size={12} />
                </span>
                step
              </span>
            </div>
          </Sample>
        </section>

        {/* ---------------- 浮层与容器 ---------------- */}
        <section>
          <h2 className={styles.sectionTitle}>{t("dshOverlays")}</h2>
          <p className={styles.sectionNote}>{t("dshOverlaysNote")}</p>

          <Sample label="Tooltip" note="深底气泡；键帽变体在标签后接 ShortcutKeys">
            <div className={styles.row}>
              <span className={tooltip.bubble}>
                <span className={tooltip.label}>{t("dshTooltipSample")}</span>
              </span>
              <span className={tooltip.bubble} data-has-shortcut="">
                <span className={tooltip.label}>{t("dshTooltipSample")}</span>
                <Shortcut combo={["⌘", "B"]} tooltip />
              </span>
            </div>
          </Sample>

          <Sample label="HoverCard" note="深色预览卡（preview 变体为白卡 + panel elevation）">
            <div className={styles.row}>
              <div className={hovercard.card}>
                <p className={hovercard.title}>{t("dshHoverTitle")}</p>
                <p className={hovercard.secondary}>{t("dshHoverBody")}</p>
                <p className={hovercard.tertiary}>lib/drive-client.ts</p>
              </div>
              <div className={hovercard.preview}>
                <p className={hovercard.copied}>{t("dshHoverTitle")}</p>
              </div>
            </div>
          </Sample>

          <Sample label="Menu" note="标准行（图标 / 标签 / 快捷键）· 分组标题 · 分隔线 · 危险行 · 禁用行 · 紧凑列表">
            <div className={styles.row}>
              <div className={`${menu.list} ${menu.static}`} role="menu" aria-label={t("dshMenuNew")}>
                <div className={menu.viewport}>
                  <div className={menu.itemWrap}>
                    <button type="button" role="menuitem" className={menu.item}>
                      <span className={menu.itemIcon}>
                        <Icon name="plus" size={14} />
                      </span>
                      <span className={menu.itemLabel}>{t("dshMenuNew")}</span>
                      <span className={menu.shortcut}>
                        <Shortcut combo={["⌘", "N"]} />
                      </span>
                    </button>
                  </div>
                  <div className={menu.itemWrap}>
                    <button type="button" role="menuitem" className={menu.item}>
                      <span className={menu.itemIcon}>
                        <Icon name="gear" size={14} />
                      </span>
                      <span className={menu.itemLabel}>{t("dshMenuSettings")}</span>
                      <span className={menu.shortcut}>
                        <Shortcut combo={["⌘", ","]} />
                      </span>
                    </button>
                  </div>
                  <div className={menu.separator} role="separator" />
                  <div className={menu.label}>{t("dshMenuGroup")}</div>
                  <div className={menu.itemWrap}>
                    <button type="button" role="menuitem" className={menu.item}>
                      <span className={menu.itemIcon}>
                        <Icon name="doc" size={14} />
                      </span>
                      <span className={menu.itemLabel}>{t("dshHoverTitle")}</span>
                    </button>
                  </div>
                  <div className={menu.itemWrap}>
                    <button type="button" role="menuitem" className={menu.item} aria-disabled="true">
                      <span className={menu.itemIcon}>
                        <Icon name="pencil" size={14} />
                      </span>
                      <span className={menu.itemLabel}>{t("dshMenuDisabled")}</span>
                    </button>
                  </div>
                  <div className={menu.separator} role="separator" />
                  <div className={menu.itemWrap}>
                    <button type="button" role="menuitem" className={`${menu.item} ${menu.danger}`}>
                      <span className={menu.itemIcon}>
                        <Icon name="xmark" size={14} />
                      </span>
                      <span className={menu.itemLabel}>{t("dshMenuRelease")}</span>
                    </button>
                  </div>
                </div>
              </div>
              <div className={`${menu.list} ${menu.static} ${menu.compactList}`} role="menu" aria-label={t("dshMenuGroup")}>
                <div className={menu.viewport}>
                  <div className={menu.itemWrap}>
                    <button type="button" role="menuitem" className={menu.item}>
                      <span className={menu.itemIcon}>
                        <Icon name="terminal" size={12} />
                      </span>
                      <span className={menu.itemLabel}>bash</span>
                    </button>
                  </div>
                  <div className={menu.itemWrap}>
                    <button type="button" role="menuitem" className={menu.item}>
                      <span className={menu.itemIcon}>
                        <Icon name="doc" size={12} />
                      </span>
                      <span className={menu.itemLabel}>read</span>
                    </button>
                  </div>
                  <div className={menu.separator} role="separator" />
                  <div className={menu.label}>{t("dshMenuGroup")}</div>
                  <div className={menu.itemWrap}>
                    <button type="button" role="menuitem" className={menu.item}>
                      <span className={menu.itemLabel}>{t("dshMenuSettings")}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </Sample>

          <Sample
            label="MenuSurface"
            note="半透明填充 + backdrop blur(40px) saturate(150%)，背景色块用来读出材质"
            stage="material"
          >
            <div className={`${menuSurface.surface}`} style={{ padding: 8, minWidth: 200 }}>
              <div className={menuSurface.material} aria-hidden="true" />
              <div className={styles.surfaceContent}>{t("dshMenuNew")}</div>
              <div className={styles.surfaceContent}>{t("dshMenuSettings")}</div>
              <div className={styles.surfaceContent}>{t("dshMenuRelease")}</div>
            </div>
          </Sample>

          <Sample label="Modal" note="panel 圆角 28px + prominent elevation；tone=warning 在标题前挂警示图标">
            <div className={styles.modalRow}>
              <div className={modal.dialog} role="dialog" aria-modal="false" aria-label={t("dshModalTitle")}>
                <div className={modal.content}>
                  <div className={modal.header}>
                    <h3 className={modal.title}>{t("dshModalTitle")}</h3>
                    <button type="button" className={modal.close} aria-label={t("dshModalCancel")}>
                      <Icon name="xmark" size={16} />
                    </button>
                  </div>
                  <p className={modal.description}>{t("dshModalBody")}</p>
                  <div className={modal.footer}>
                    <button type="button" className={`${button.button} ${button.md} ${button.ghost}`}>
                      {t("dshModalCancel")}
                    </button>
                    <button type="button" className={`${button.button} ${button.md} ${button.primary}`}>
                      {t("dshModalConfirm")}
                    </button>
                  </div>
                </div>
              </div>
              <div className={`${modal.dialog} ${modal.warning}`} role="dialog" aria-modal="false" aria-label={t("dshModalWarnTitle")}>
                <div className={modal.content}>
                  <div className={modal.header}>
                    <h3 className={modal.title}>
                      <span className={modal.warningIcon}>
                        <Icon name="warning" size={18} />
                      </span>
                      {t("dshModalWarnTitle")}
                    </h3>
                    <button type="button" className={modal.close} aria-label={t("dshModalCancel")}>
                      <Icon name="xmark" size={16} />
                    </button>
                  </div>
                  <p className={modal.description}>{t("dshModalWarnBody")}</p>
                  <div className={modal.footer}>
                    <button type="button" className={`${button.button} ${button.md} ${button.ghost}`}>
                      {t("dshModalCancel")}
                    </button>
                    <button type="button" className={`${button.button} ${button.md} ${button.primary}`}>
                      {t("dshModalDiscard")}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </Sample>

          <Sample label="Toast" note="两主题都保持深底；动作文字为蓝色链接态">
            <div className={toast.toast} role="alert">
              <span className={`${toast.icon} ${toast.success}`} aria-hidden="true">
                <Icon name="check" size={16} />
              </span>
              <span className={toast.text}>
                {t("dshToastText")}
                <button type="button" className={toast.action}>
                  {t("dshToastUndo")}
                </button>
              </span>
            </div>
          </Sample>

          <Sample label="DisclosureRow" note="24px 行高：16px 图标位 + 6px 间隙 + 13px 标题；正文由消费方给">
            <div className={disclosure.root}>
              <div className={disclosure.header}>
                <div className={disclosure.row} data-expandable="">
                  <span className={disclosure.leading}>
                    <span className={disclosure.iconIdle}>
                      <Icon name="wrench" size={14} />
                    </span>
                    <span className={disclosure.chevronHover}>
                      <Icon name="chevron-down" size={14} />
                    </span>
                  </span>
                  <span className={disclosure.title}>{t("dshDisclosureTitle")}</span>
                </div>
              </div>
              <p className={styles.disclosureBody}>{t("dshDisclosureBody")}</p>
            </div>
          </Sample>
        </section>

        {/* ---------------- Agent 输出卡片 ---------------- */}
        <section>
          <h2 className={styles.sectionTitle}>{t("dshOutputs")}</h2>
          <p className={styles.sectionNote}>{t("dshOutputsNote")}</p>

          <Sample label="TerminalBlock" note="左侧 30px 状态槽（运行点居首行中线）· 横幅与输出共用代码面 · l2 发丝分隔">
            <div className={terminal.block} data-body="">
              <div className={terminal.header}>
                <div className={terminal.prompt}>
                  <div className={terminal.promptLine}>
                    <span className={terminal.runState}>
                      <span className={dot.dot} data-state="done" style={{ width: 10, height: 10 }} />
                    </span>
                    <span className={terminal.cwd}>~/agent-design</span>
                    <span className={terminal.command}>{t("dshTerminalCommand")}</span>
                    <span className={terminal.status}>
                      <span className={pill.pill}>exit 0</span>
                    </span>
                  </div>
                </div>
              </div>
              <div className={terminal.output}>
                <div className={terminal.line}> ✓ 53 test files passed (53)</div>
                <div className={terminal.line}> ✓ 412 tests passed (412)</div>
                <div className={terminal.line}> Duration 8.42s</div>
              </div>
            </div>
          </Sample>

          <Sample label="ReadBlock" note="行号 gutter 右对齐弱化；代码面与卡片头共用">
            <div className={codeCard.card}>
              <div className={codeCard.header}>
                <div className={codeCard.heading}>
                  <span className={codeCard.language}>tsx</span>
                  <span className={codeCard.title}>packages/app/src/lib/drive-client.ts</span>
                </div>
                <div className={codeCard.actions}>
                  <button type="button" className={codeCard.action} title={t("copy")}>
                    <Icon name="doc" size={16} />
                  </button>
                </div>
              </div>
              <div className={codeCard.body} style={{ padding: "6px 22px 20px" }}>
                <div className={read.block} data-code-wrap="false">
                  {[
                    ["12", "export function attach(sessionId: string): void {"],
                    ["13", "  if (lease.holder !== null) throw new Error('busy');"],
                    ["14", "  socket.send({ type: 'attach', sessionId });"],
                    ["15", "}"],
                  ].map(([number, text]) => (
                    <div key={number} className={read.line}>
                      <span className={read.gutter} aria-hidden="true">
                        {number}
                      </span>
                      <span className={read.content}>{text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Sample>

          <Sample label="DiffBlock" note="add / del / context / gap 四类行：整行洗涤色 + 左侧 3px 竖条">
            <div className={`${codeCard.card} ${diff.block}`} data-code-wrap="false">
              <div className={codeCard.header}>
                <div className={codeCard.heading}>
                  <span className={codeCard.language}>diff</span>
                  <span className={codeCard.title}>drive-client.ts</span>
                </div>
              </div>
              <div className={diff.body}>
                <div className={diff.line}> @@ -10,6 +10,7 @@</div>
                <div className={`${diff.line} ${diff.context}`}>{" export function attach(sessionId: string) {"}</div>
                <div className={`${diff.line} ${diff.del}`}>{"  throw new Error('busy')"}</div>
                <div className={`${diff.line} ${diff.add}`}>{"  if (lease.holder !== null) throw new Error('busy')"}</div>
                <div className={`${diff.line} ${diff.add}`}>{"  lease.holder = sessionId"}</div>
                <div className={`${diff.line} ${diff.context}`}>{" }"}</div>
                <div className={`${diff.line} ${diff.gap}`}> ⋯</div>
              </div>
            </div>
          </Sample>

          <Sample label="SearchBlock" note="摘要栏 + 文件组头（路径 + 命中计数）+ 行号弱化的匹配行">
            <div className={search.block} data-search="content">
              <div className={search.header}>
                <span className={search.summary}>
                  {t("dshSearchQuery")} · 2 files · 5 matches
                </span>
              </div>
              <div className={search.body}>
                <div className={search.fileHeader}>
                  <span className={search.filePath}>packages/core/src/lease.ts</span>
                  <span className={search.fileCount}>3</span>
                </div>
                <div className={search.line}>
                  <span className={search.lineNumber}>42: </span>export function acquire(sessionId: string)
                </div>
                <div className={search.line}>
                  <span className={search.lineNumber}>57: </span>  if (lease.holder === sessionId) return
                </div>
                <div className={search.fileHeader}>
                  <span className={search.filePath}>packages/app/src/lib/drive-client.ts</span>
                  <span className={search.fileCount}>2</span>
                </div>
                <div className={search.line}>
                  <span className={search.lineNumber}>18: </span>// one client lease per session
                </div>
              </div>
            </div>
          </Sample>

          <Sample label="WebBlock" note="search 卡片（答案段 + 编号来源）与 fetch 卡片（URL + 状态行）">
            <div className={web.block} data-web="search">
              <p className={web.answer}>{t("dshWebAnswer")}</p>
              <ol className={web.sources}>
                <li className={web.source} value={1}>
                  <a className={web.sourceLink} href="https://github.com/deepseek-ai" target="_blank" rel="noopener noreferrer">
                    github.com/deepseek-ai
                  </a>
                  <div className={web.snippet}>Single client lease: one window holds the control socket at a time.</div>
                </li>
                <li className={web.source} value={2}>
                  <a className={web.sourceLink} href="https://deepseek.com" target="_blank" rel="noopener noreferrer">
                    deepseek.com
                  </a>
                  <div className={web.published}>2026-11-12</div>
                </li>
              </ol>
            </div>
            <div className={`${web.block} ${web.fetch}`} data-web="fetch">
              <a className={web.fetchUrl} href="https://deepseek.com" target="_blank" rel="noopener noreferrer">
                https://deepseek.com/docs/drive-protocol
              </a>
              <div className={web.fetchMeta}>
                <span className={web.status}>HTTP 200</span>
              </div>
            </div>
          </Sample>

          <Sample label="CodeCard" note="围栏代码块的共用卡片：语言标签 + 标题 + 动作区，正文 11px/19px 等宽">
            <div className={codeCard.card}>
              <div className={codeCard.header}>
                <div className={codeCard.heading}>
                  <span className={codeCard.language}>ts</span>
                  <span className={codeCard.title}>attach.ts</span>
                </div>
                <div className={codeCard.actions}>
                  <button type="button" className={codeCard.action} title={t("copy")}>
                    <Icon name="doc" size={16} />
                  </button>
                </div>
              </div>
              <div className={codeCard.body}>
                <pre>
                  <code>{CODE_SAMPLE}</code>
                </pre>
              </div>
            </div>
          </Sample>

          <Sample label="UserMessageBubble" note="用户消息：深一号的表面 + 20px 圆角 + 16px 内距">
            <div className={styles.bubbleRow}>
              <div className={bubble.bubble}>{t("dshUserMessage")}</div>
            </div>
          </Sample>
        </section>
      </div>
    </div>
  );
}
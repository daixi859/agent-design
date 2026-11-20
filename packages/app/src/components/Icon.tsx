/**
 * Ant Design 规格描边图标集（Q12：原生骨架；规格依据 antd docs/spec/icon.zh-CN.md）。
 * 1024 画板、viewBox 64 64 896 896（四周预留 64 出血位）；描边 76（8 倍数线规，
 * 弧线按官方惯例在 72 上 +4 微调视觉分量）；圆头圆角；实心箭头顶角 76°；
 * 坐标一律取偶。配色跟随 currentColor。
 */
import type { JSX } from "react";

export type IconName =
  | "panel-left"
  | "plus"
  | "search"
  | "chevron-left"
  | "chevron-right"
  | "chevron-down"
  | "arrow-down"
  | "arrow-up"
  | "arrow-down-to-line"
  | "sun"
  | "moon"
  | "branch"
  | "sparkles"
  | "wrench"
  | "terminal"
  | "doc"
  | "pencil"
  | "folder"
  | "folder-open"
  | "warning"
  | "play"
  | "pause"
  | "xmark"
  | "stop"
  | "check"
  | "spinner"
  | "gear"
  | "expand"
  | "contract"
  | "arrow-left"
  /* ADR-0013 工具行所需：内核工具名 → 图标的映射不能在 wrench 上收口 */
  | "globe"
  | "code"
  | "users"
  | "clock"
  /* Model Seat 行内能力徽标（ADR-0016 补记）：模型接受图片输入 */
  | "image";

const glyphs: Record<IconName, JSX.Element> = {
  /* 外框 720×560 圆角外框 + 1/3 处分隔线（分隔线端点落在外框中心线上，圆帽融合） */
  "panel-left": (
    <>
      <rect x="152" y="232" width="720" height="560" rx="16" />
      <path d="M400 232v560" />
    </>
  ),
  /* 十字：中心 (512,512)，臂长 640（官方 plus 条长 720 含端圆） */
  plus: <path d="M512 192v640M192 512h640" />,
  /* 柄沿 45° 从圆中心线边出发，端帽外缘不出出血位 */
  search: (
    <>
      <circle cx="464" cy="464" r="224" />
      <path d="m624 624 240 240" />
    </>
  ),
  /* chevron 系：90° 折角（官方线描折角惯例），臂投影 224 */
  "chevron-left": <path d="M592 288 368 512l224 224" />,
  "chevron-right": <path d="M432 288l224 224-224 224" />,
  "chevron-down": <path d="M288 432l224 224 224-224" />,
  /* 箭头系：杆过中心、V 形 45° 斜线，同构保证成组韵律 */
  "arrow-down": <path d="M512 192v608M296 584l216 216 216-216" />,
  "arrow-up": <path d="M512 832V224M296 440l216-216 216 216" />,
  /* 落位箭头：注入行专用（上下文注入，ADR-0004 修订二）——底横线表达「进入上下文」 */
  "arrow-down-to-line": <path d="M512 128v504M296 416l216 216 216-216M192 864h640" />,
  /* 太阳：中心圆 r176，光线径向 240~400（起点留 64 空隙，端帽不出出血位） */
  sun: (
    <>
      <circle cx="512" cy="512" r="176" />
      <path d="M512 112v160M512 752v160M112 512h160M752 512h160M342 342 230 230M682 342 794 230M342 682 230 794M682 682 794 794" />
    </>
  ),
  /* 月牙：外弧小圆 + 内弧大圆两段构成轮廓 */
  moon: <path d="M810 630a324 324 0 0 1-416-416 336 336 0 1 0 416 416Z" />,
  /* 分支：三节点圆（点规 r88 = 16 倍数系）+ 左干竖线 + 右枝弧线接入干上 */
  branch: (
    <>
      <circle cx="296" cy="256" r="88" />
      <circle cx="296" cy="768" r="88" />
      <circle cx="728" cy="336" r="88" />
      <path d="M296 344v336" />
      <path d="M728 424c0 136-116 192-272 192H312" />
    </>
  ),
  /* 双四角星：直线折角星形，主星 R256 内凹 64，次星 R136 内凹 36 */
  sparkles: (
    <>
      <path d="M436 180 500 372 692 436 500 500 436 692 372 500 180 436 372 372Z" />
      <path d="M756 620 792 720 892 756 792 792 756 892 720 792 620 756 720 720Z" />
    </>
  ),
  /* 扳手：头部开口由三段折线构成，手柄端大弧钩（长斜线端点收紧不出出血位） */
  wrench: (
    <path d="M704 184a232 232 0 0 0-250 332l-268 272a96 96 0 1 0 136 132l270-268a232 232 0 0 0 326-248l-146 148-128-18-18-130Z" />
  ),
  /* 提示符窗口：圆角外框 + 90° 提示符 + 回显横线（整组垂直居中于框心 512） */
  terminal: (
    <>
      <rect x="152" y="232" width="720" height="560" rx="16" />
      <path d="M336 384 464 512 336 640M560 640h144" />
    </>
  ),
  /* 文件：右上 45° 折角（248），两行内文留 128 右白 */
  doc: (
    <>
      <path d="M296 176h240l192 192v512H296Z" />
      <path d="M432 560h168M432 712h168" />
    </>
  ),
  /* 铅笔：45° 斜置，笔头外弧 A84，笔尖斜线示削口 */
  pencil: (
    <>
      <path d="M232 808 276 652 676 252A84 84 0 0 1 794 370L394 770Z" />
      <path d="m640 284 120 120" />
    </>
  ),
  /* 文件夹：官方 folder 同构——顶边 tab 45° 斜切（104×104）落肩，四角 A32 */
  folder: (
    <path d="M152 816V288a32 32 0 0 1 32-32h212l104 104h356a32 32 0 0 1 32 32v424a32 32 0 0 1-32 32H184a32 32 0 0 1-32-32Z" />
  ),
  /* 打开的文件夹：后盖（tab 落肩到右缘短段）+ 前板（左上斜切口 + 右侧倾斜底缘） */
  "folder-open": (
    <>
      {/* 后盖短边：盖口在上一半，表达「打开」 */}
      <path d="M152 352v-80a32 32 0 0 1 32-32h212l104 104h356a32 32 0 0 1 32 32v112" />
      {/* 前板：左上斜切口 + 右侧倾斜底缘 */}
      <path d="M152 712V352l110 164h594l-64 240H244a92 92 0 0 1-92-44Z" />
    </>
  ),
  /* 警示三角：顶角 ~58°（官方 warning 同比），感叹号竖线与点分置 */
  warning: (
    <>
      <path d="M512 152 912 872H112Z" />
      <path d="M512 416v192M512 712h.01" />
    </>
  ),
  /* 叉：对角双线，跨度 460（与官方 close 同比） */
  xmark: <path d="m282 282 460 460m0-460-460 460" />,
  /* 中断（GLOSSARY「Stop 按钮」）：圆角实心方块，pi TUI 的 Esc-to-interrupt 按钮化身 */
  stop: <rect x="320" y="320" width="384" height="384" rx="64" fill="currentColor" stroke="none" />,
  /* ADR-0014 TUI 状态字形：对勾（槽位完成态）；spinner 是 270° 圆弧，
     旋转动画由使用方的 CSS 驱动（图标集保持纯静态字形） */
  check: <path d="M240 512 440 712 800 320" />,
  spinner: <path d="M512 164A348 348 0 1 1 164 512" />,
  /* 实心规格三角：顶角 76°（tan38° 定宽高比 328:512） */
  play: <path d="M380 256 708 512 380 768Z" />,
  pause: <path d="M384 256v512M640 256v512" />,
  /* 滑杆式设置（SF slider.horizontal.3 同构）：三滑轨 + 错位旋钮，轨断口落在旋钮中心线边 */
  gear: (
    <>
      <path d="M152 296h368M696 296h176M152 512h160M488 512h384M152 728h416M744 728h128" />
      <circle cx="608" cy="296" r="88" />
      <circle cx="400" cy="512" r="88" />
      <circle cx="656" cy="728" r="88" />
    </>
  ),
  /* 全屏进出：对角双箭头，外撑 / 内收 */
  expand: (
    <>
      <path d="M678 346 856 168M856 346V168H678" />
      <path d="M346 678 168 856M168 678v178h178" />
    </>
  ),
  contract: (
    <>
      <path d="M856 168 678 346M678 168v178h178" />
      <path d="M168 856 346 678M346 856V678H168" />
    </>
  ),
  "arrow-left": <path d="M832 512H224M440 296 224 512l216 216" />,
  /* 网页取用（web_fetch / web_search）：外圆 + 赤道横线 + 经线椭圆 */
  globe: (
    <>
      <circle cx="512" cy="512" r="352" />
      <path d="M160 512h704" />
      <ellipse cx="512" cy="512" rx="152" ry="352" />
    </>
  ),
  /* 代码工具（codemode）：尖括号对，90° 折角投影 184 */
  code: <path d="M368 328 184 512l184 184M656 328 840 512 656 696" />,
  /* 子代理 / Agent：主像（圆头 + 肩弧）+ 次像（半头弧 + 半肩弧） */
  users: (
    <>
      <circle cx="400" cy="352" r="120" />
      <path d="M168 832c0-132 100-220 232-220s232 88 232 220" />
      <path d="M688 244a120 120 0 0 1 0 216" />
      <path d="M756 604c88 44 124 128 124 228" />
    </>
  ),
  /* 列表 / 待办：外圆 + 指针（12 点 → 四点半） */
  clock: (
    <>
      <circle cx="512" cy="512" r="352" />
      <path d="M512 320v192l136 88" />
    </>
  ),
  /* 图片输入（SF photo 同构）：相框 + 光点（r56）+ 折线山形 */
  image: (
    <>
      <rect x="152" y="232" width="720" height="560" rx="16" />
      <circle cx="352" cy="416" r="56" />
      <path d="M272 728 432 552 568 696 688 576 808 696" />
    </>
  ),
};

export function Icon({
  name,
  size = 16,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="64 64 896 896"
      fill="none"
      stroke="currentColor"
      strokeWidth={76}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {glyphs[name]}
    </svg>
  );
}

/** 图标全名单（Preview 页网格用，随 glyphs 自动同步） */
export const ICON_NAMES = Object.keys(glyphs) as IconName[];

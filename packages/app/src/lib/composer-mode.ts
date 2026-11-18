/** ComposerMode：输入区的一元状态机（C3 加深）。原四态由 SessionView 四源拼装、
 *  且 driven 一个态名下藏着 driven-or-attaching——attach 在途只能靠 sendText 返回值
 *  隐式传达；这里把「在途」收进显式状态，判据可测。连接就绪度不入态：断线时输入区
 *  依设计保持可用（乐观回显顶住、重连重放续发，ADR-0012 断线语义），就绪与否只在
 *  发送瞬间由 sendText 兜底，不改变任何渲染分支。 */
import { isBusyStatus } from "./drive-client";
import type { DriveSession } from "./drive-client";

export type ComposerMode =
  | "driven"
  /** attach 在途（Send-to-Attach 乐观注册空窗）：可输入，占位符与 driven 同 */
  | "attaching"
  /** 浏览态可懒接管（file 在场、非他属） */
  | "lazy"
  /** 他属驱动（别的连接持属主） */
  | "foreign"
  /** 不可驱动（无 file 等） */
  | "locked";

export interface ComposerModeInput {
  /** 本端驱动表有此会话（乐观注册的壳也算） */
  driven: boolean;
  /** 该会话有 attach 在途（DriveClient inflight 镜像） */
  attaching: boolean;
  /** 可懒接管：file 在场 */
  takeover: boolean;
  /** 他属驱动（REST driven 标志 × 本端驱动表） */
  foreignDriven: boolean;
}

export function composerModeOf(input: ComposerModeInput): ComposerMode {
  if (input.attaching) return "attaching";
  if (input.driven) return "driven";
  if (input.foreignDriven) return "foreign";
  if (input.takeover) return "lazy";
  return "locked";
}

/** 可输入 = 本端在管（含 attach 在途），或可懒接管（他属驱动与不可驱动除外） */
export function composerCanInput(mode: ComposerMode): boolean {
  return mode === "driven" || mode === "attaching" || mode === "lazy";
}

/** 占位符判定（GLOSSARY ADR-0017 状态化占位符）：优先级 compacting > retrying > busy >
 *  chip > 默认——原是三元嵌套里没写出来的隐式优先级，这里显式成序表驱动。 */
export type PlaceholderState = "compacting" | "retrying" | "busy" | "chip" | "default";

export function placeholderStateOf(drive: DriveSession | undefined, chip: boolean, canInput: boolean): PlaceholderState {
  if (!canInput) return "default";
  if (drive?.compacting) return "compacting";
  if (drive?.status === "retrying") return "retrying";
  if (isBusyStatus(drive?.status)) return "busy";
  if (chip) return "chip";
  return "default";
}

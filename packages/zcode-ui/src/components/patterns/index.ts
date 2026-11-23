/**
 * 组合模式层：带产品假设的复合件（数字翻页版式、轻量 diff、单条 Toast）。
 * 与 ./ui 分开导出——消费方一眼能判断「这一层不是通用原子件」。
 */
export {
  FlipMetricValue,
  flipMetricTransition,
  type FlipMetricValueProps,
} from "./FlipMetricValue";
export {
  LightweightDiffPreview,
  getLightweightDiffLineParts,
  type LightweightDiffLineKind,
  type LightweightDiffLineParts,
  type LightweightDiffPreviewProps,
} from "./LightweightDiffPreview";
export { Toast, toastVariants, type ToastProps, type ToastVariant } from "./Toast";
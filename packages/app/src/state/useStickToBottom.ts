/** 贴底跟随（stick-to-bottom）：内容增长时仅当用户处于底部阈值内才贴底；
 *  用户上滑越过阈值即放手（不与用户抢滚动条、不跳动），滑回阈值内自动恢复跟随。
 *  Transcript 滚动区与 TuiGroup 槽位区同款行为的通用实现。
 *  判定走滚动位置现场求值（scroll 事件里更新 ref，不进 state、不触发重绘）；
 *  贴底是 scrollTop 赋值的即时动作，不做平滑动画（跟随要贴住最新内容）。 */
import { useCallback, useRef, type RefObject } from "react";

/** 解除跟随的距离阈值：距底超过它视为「用户在看历史」 */
const RELEASE_THRESHOLD_PX = 48;

export function useStickToBottom<T extends HTMLElement>(
  ref: RefObject<T | null>,
  threshold: number = RELEASE_THRESHOLD_PX,
) {
  const nearBottomRef = useRef(true);

  /** 滚动事件里刷新近底标记（挂到滚动容器的 onScroll 上） */
  const onScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }, [ref, threshold]);

  /** 条件贴底：内容增长后的跟随动作，仅近底时生效 */
  const stick = useCallback(() => {
    const el = ref.current;
    if (el && nearBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [ref]);

  /** 无条件贴底并复位跟随：用户主动展开容器 / 点「跳到最新」——这是用户要的底部 */
  const snap = useCallback(() => {
    const el = ref.current;
    if (el) {
      nearBottomRef.current = true;
      el.scrollTop = el.scrollHeight;
    }
  }, [ref]);

  return { nearBottomRef, onScroll, stick, snap };
}

/**
 * 测试环境准备：jsdom 缺的浏览器 API 补丁 + 每个用例后的清理与还原。
 * 只在测试里 import，不参与打包（不在任何 index 桶里导出）。
 */
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
// jest-dom 的断言（toHaveAttribute / toBeVisible…）通过这个入口接到 vitest 的 expect 上。
import "@testing-library/jest-dom/vitest";

/** 每个测试文件顶部调用一次：补 API + 注册 afterEach 清理与还原（vitest 未开 globals）。 */
export function setupTestDom() {
  if (typeof window === "undefined") return;

  installMissingApis();
  const restoreRect = patchBoundingRect();

  afterEach(() => {
    cleanup();
    // 覆盖原型是在文件级生效的；还原本文件内的改动，避免污染同进程的其它测试文件。
    restoreRect();
  });
}

function installMissingApis() {
  if (!("ResizeObserver" in window)) {
    class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    (window as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
  }

  // radix 的 Select / Menu 用指针捕获判断拖选，jsdom 没有实现。
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
  }

  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
}

/**
 * radix 的碰撞翻转要读元素尺寸，jsdom 一律返回 0，浮层会退化成不可见。
 * 直接无条件覆盖（jsdom 会校验原生实现的接收者，不能在原型上先调一次再判断），
 * 并返回还原函数交给 afterEach。
 */
function patchBoundingRect() {
  const original = Element.prototype.getBoundingClientRect;
  const rect = { width: 120, height: 40, top: 0, left: 0, bottom: 40, right: 120, x: 0, y: 0 };
  Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
    return { ...rect, toJSON: () => rect } as DOMRect;
  };
  return () => {
    Element.prototype.getBoundingClientRect = original;
  };
}

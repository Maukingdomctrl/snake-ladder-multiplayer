// Browser APIs jsdom doesn't provide.
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => cleanup());

/** Every observed element reports this size (tests can change it). */
export const observedSize = { width: 400, height: 700 };

class TestResizeObserver {
  private callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element) {
    const contentRect = { width: observedSize.width, height: observedSize.height } as DOMRectReadOnly;
    this.callback([{ target, contentRect } as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = TestResizeObserver as unknown as typeof ResizeObserver;

Element.prototype.getBoundingClientRect = function () {
  return { x: 0, y: 0, top: 0, left: 0, right: observedSize.width, bottom: observedSize.height, ...observedSize, toJSON() {} } as DOMRect;
};

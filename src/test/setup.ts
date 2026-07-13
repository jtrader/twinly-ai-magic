import "@testing-library/jest-dom/vitest";

// jsdom lacks ResizeObserver — Radix (RadioGroup/Checkbox) needs it.
if (typeof (globalThis as any).ResizeObserver === "undefined") {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

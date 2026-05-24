// Alias jest → vi so that @testing-library/dom's jestFakeTimersAreEnabled()
// detects vi.useFakeTimers() correctly and takes the fake-timers path in waitFor.
// Without this, RTL falls back to real-timers polling (setInterval/MutationObserver)
// which is blocked when vi.useFakeTimers() has replaced those APIs.
// See: https://github.com/testing-library/dom-testing-library/issues/987
import { vi } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).jest = vi;

// jsdom does not implement ResizeObserver; stub it so components that use it
// (e.g. GraphCanvas) don't throw in unit tests.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// jsdom does not implement SVG geometry (width/height baseVal). d3-zoom reads
// these synchronously inside animation frames that can fire after test teardown.
// Stub SVGAnimatedLength so d3-zoom gets a value of 0 instead of throwing.
const animLen = { baseVal: { value: 0 } };
if (typeof SVGSVGElement !== 'undefined') {
  Object.defineProperty(SVGSVGElement.prototype, 'width', { get: () => animLen, configurable: true });
  Object.defineProperty(SVGSVGElement.prototype, 'height', { get: () => animLen, configurable: true });
}

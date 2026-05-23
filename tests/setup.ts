// Alias jest → vi so that @testing-library/dom's jestFakeTimersAreEnabled()
// detects vi.useFakeTimers() correctly and takes the fake-timers path in waitFor.
// Without this, RTL falls back to real-timers polling (setInterval/MutationObserver)
// which is blocked when vi.useFakeTimers() has replaced those APIs.
// See: https://github.com/testing-library/dom-testing-library/issues/987
import { vi } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).jest = vi;

import "@testing-library/jest-dom/vitest";
import { afterEach, expect } from "vitest";
import { cleanup } from "@testing-library/react";
import { toHaveNoViolations } from "vitest-axe/dist/matchers.js";

// vitest-axe's bundled dist/extend-expect.js ships as a 0-byte file for
// the installed version (a broken build on their end, not ours — see
// vitest-axe.d.ts for the accompanying type augmentation this needs).
// The `axe`/`configureAxe` runner and the `toHaveNoViolations` matcher
// function both work fine; only the auto-wiring `expect.extend()` call
// that file was supposed to make is missing. Doing it here by hand gets
// the exact same result the package intended.
expect.extend({ toHaveNoViolations });

afterEach(() => {
  cleanup();
});

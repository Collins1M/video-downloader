// vitest-axe's own extend-expect module (which would normally bring this
// type augmentation along for free) ships as a 0-byte broken build for
// the installed version — see vitest.setup.ts for the matching runtime
// workaround. This file supplies just the type augmentation half.
//
// Two things about the shape of this file matter and were only found by
// trial and error in this sandbox:
// 1. The side-effect `import "vitest"` is required — augmenting a
//    module from a separate file needs an import of that exact module
//    specifier (this mirrors @testing-library/jest-dom's own
//    vitest.d.ts). Without it, this file's `declare module` block
//    silently replaces jest-dom's own toBeInTheDocument-etc.
//    augmentation instead of merging with it.
// 2. `AxeMatchers` must come in as a normal named import, not an inline
//    `import(...).AxeMatchers` type query inside the `extends` clause —
//    the inline form type-checks but the merge doesn't pick up the
//    matcher members, so `toHaveNoViolations` stays missing.
import "vitest";
import type { AxeMatchers } from "vitest-axe/dist/matchers.js";

declare module "vitest" {
  interface Assertion<T = any> extends AxeMatchers {}
  interface AsymmetricMatchersContaining extends AxeMatchers {}
}

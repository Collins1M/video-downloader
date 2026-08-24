# Accessibility audit (Phase 14, item 21)

## Method

1. Computed real WCAG 2.1 contrast ratios (relative-luminance formula) for
   every foreground/background pairing in `apps/web/tailwind.config.js`,
   rather than eyeballing the palette. Script and results below.
2. Read every interactive component in `apps/web/components` for missing
   accessible names, missing live regions on dynamically-updating text,
   and missing ARIA relationships between disclosure triggers and their
   panels.
3. Added `vitest-axe` and ran real axe-core rule checks against 12
   rendered component states (not just visual spot-checks) —
   `apps/web/__tests__/accessibility.spec.tsx`.

## Contrast findings

| Foreground | Background | Ratio | AA normal text (4.5) | AA large text (3.0) |
| --- | --- | --- | --- | --- |
| `ink` | `void` / `surface` / `surface-raised` | 17.65 / 15.98 / 14.84 | PASS | PASS |
| `ink-muted` | `void` / `surface` / `surface-raised` | 5.99 / 5.42 / 5.03 | PASS | PASS |
| `amber` | `void` / `surface` / `surface-raised` | 10.39 / 9.41 / 8.74 | PASS | PASS |
| `amber-bright` | `void` / `surface` / `surface-raised` | 12.30 / 11.14 / 10.35 | PASS | PASS |
| `amber-dim` | `void` / `surface` | 5.22 / 4.72 | PASS | PASS |
| `amber-dim` | `surface-raised` | **4.39** | **fail** | PASS |

`amber-dim` (`#B87333`) on `surface-raised` (`#1D1E23`) is the one
combination that doesn't clear 4.5:1. In practice this isn't a live bug —
`amber-dim` isn't referenced anywhere in `apps/web/components` today (it's
a palette token defined for future use, not yet wired to any element) — so
nothing on the site currently renders this pairing. Flagging it here
rather than silently deleting the token: if `amber-dim` gets used on a
`surface-raised` background in a future change, keep it to large text
(≥18.66px bold or ≥24px regular) or swap to `amber`/`amber-bright`, which
both clear AA everywhere in the palette.

## Fixes made

- **Placeholder-only input labeling** — the URL input (`url-input-form.tsx`)
  had a placeholder but no accessible name for screen readers once the
  placeholder is replaced by typed text. Added `aria-label="Video URL"`.
- **Missing progressbar semantics** — the download progress bar
  (`download-progress.tsx`) was a styled `<div>` with no ARIA role or
  value exposed. Added `role="progressbar"` with `aria-valuenow/min/max`
  and a label reflecting the current stage.
- **Missing `aria-live` regions** — both the analyzing-state stage list
  (`analyzing-state.tsx`) and the download progress stage/percentage text
  (`download-progress.tsx`) update over time with no announcement to
  screen reader users. Added `aria-live="polite"` to both.
- **FAQ panel/trigger linking** — the FAQ accordion (`faq.tsx`) had
  `aria-expanded` on the trigger but no `aria-controls` pointing at the
  panel, and the panel itself had no `id`, `role`, or `aria-labelledby`
  back to its trigger. Added the full relationship (trigger `id` +
  `aria-controls`, panel `id` + `role="region"` + `aria-labelledby`), and
  wrapped each trigger in an `<h3>` so the FAQ list is also navigable by
  heading.
- **Missing skip-to-content link** — there was no way to bypass the
  header/nav and jump straight to page content. Added a
  visually-hidden-until-focused skip link in `app/(site)/layout.tsx`
  targeting a new `id="main-content"` on `<main>`.

## Test coverage

`apps/web/__tests__/accessibility.spec.tsx` runs axe-core against: the URL
input form in its idle/filled/disabled states, the analyzing state, the
video info card, the format list (populated and empty), the download
progress panel, the FAQ with a panel expanded, the site header, the site
footer, and the shared legal-page layout. All 12 pass with zero
violations as of this phase.

## `vitest-axe` sandbox note

The installed `vitest-axe` version ships `dist/extend-expect.js` as a
0-byte file — a broken build on the package's end, not something specific
to this repo. `dist/matchers.js` (the actual `toHaveNoViolations`
implementation) is intact. Worked around it by importing the matcher
directly and wiring it with `expect.extend()` by hand in
`apps/web/vitest.setup.ts`, with a matching type augmentation in
`apps/web/vitest-axe.d.ts`. If a future `vitest-axe` upgrade fixes the
published build, this workaround can be removed in favor of the package's
own `vitest-axe/extend-expect` import.

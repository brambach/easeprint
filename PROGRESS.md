# Progress

Evidence per milestone. Commands were run in the cloud container on 2026-10-17 unless noted.

## M0 Scaffold

Astro 7.4 static output, TypeScript strict, eslint (TS and Astro), stylelint (standard config plus a ban on
`transition: all` and an allow-list of transform and opacity for transitions), vitest, Playwright 1.64 using the
container's Chromium 141. `CLAUDE.md` is 32 lines. `.claude/hooks/session-start.sh` runs `pnpm install` only when
`CLAUDE_CODE_REMOTE=true` (it exits 0 and does nothing otherwise; both paths were run).

- `pnpm lint`: clean
- `pnpm test`: 11 passed (easing parser, durations, list splitting)
- `pnpm build`: 1 page built
- `pnpm check` (astro check): 0 errors, 0 warnings, 0 hints

## M1 Schema

`src/lib/schema.ts` is a strict zod schema (unknown keys fail). Structure carries the rules: timing functions
must parse, `durationMs` must equal `duration`, the raw file must exist and its date must match `captured`,
ambient posture needs an `ambientKind`, partial and unmeasurable entries must say why, at most one statement
tier per site. Values from notes live in a separate dated `fromNotes` list and can't be mixed with measured tiers.

- `tests/unit/schema.test.ts` runs a real `astro build` twice: the valid fixture builds (control), and the same
  fixture with `posture` deleted fails with `InvalidContentEntryDataError` naming `posture`. It also checks that
  removing any of 10 entry fields or 7 tier fields fails the schema.
- `pnpm test`: 37 passed.
- The brief's two M1 entries can't come from notes (not in the repo), so Cuberto and Raycast are written in M2 from
  measured data.

## M2 Measure tool

`pnpm measure <url>` loads the page once in Chromium (1440x900), waits for it to settle, wheel-scrolls to the
bottom, then hovers and leaves up to 30 distinct interactive elements spread through the page. An injected probe
(`scripts/lib/probe.js`, plain JS) records `transitionrun` and `animationstart` events with the exact computed
timing values, every `Element.animate` call, `document.getAnimations()` every 120ms, GSAP's global timeline when
it's exposed, WebGL contexts and `matchMedia('(prefers-reduced-motion)')` calls. At the end it scans every
element's computed `transition` and `animation`, including `::before` and `::after`. Stylesheet and script text
the page downloaded is scanned for counts only (reduced-motion queries, `transition: all`, keyframe names,
library fingerprints); no site code is stored. `--reduced` does the same in its own run with
`prefers-reduced-motion: reduce` and writes `<date>-reduced.json`.

Runs on 2026-10-17 (each one load):

| Site | Normal run | Reduced run |
|---|---|---|
| cuberto.com | ok, 200, 68 distinct observed, 21 computed transitions, 42s | ok, 62 observed |
| raycast.com | ok, 200, 187 distinct observed, 52 transitions, 24 animations, 232s | ok, 177 observed |

Evidence:

- Raw JSON committed: `data/raw/cuberto.com/2026-10-17{,-reduced}.json`, `data/raw/raycast.com/2026-10-17{,-reduced}.json`.
- `tests/unit/trace.test.ts`: every tier on both entries (5 on Cuberto, 8 on Raycast) is found in its raw file on
  one record with the same timing function, duration, phase, property, selector and count. The schema runs the
  same check, so an untraced value also fails `astro build`.
- `tests/unit/measure.test.ts` runs the real tool twice against a local fixture page with known motion: it finds
  the hover transition `cubic-bezier(0.19, 1, 0.22, 1) 0.9s`, a CSS keyframe animation, a WAAPI call,
  `transition: all` in computed style, a linked stylesheet and an inline `<style>`, and less motion in the reduced run.
- `pnpm test`: 58 passed. `pnpm build`, `pnpm lint`, `pnpm check` clean.

Findings so far: neither site honors reduced motion for the CSS motion measured. Cuberto still runs 91% of its
movement events with it on, Raycast 95% (Raycast ships 12 reduced-motion queries; they don't touch these
transitions). Honesty notes are computed from raw files (`src/lib/honesty.ts`), not typed.

## M3 Curve plot, demo, copy

Each tier renders as a specimen: an SVG plot (`src/components/CurvePlot.astro`, geometry in `src/lib/plot.ts`)
with bezier handles (clipped, and labelled when a handle sits off chart, as Cuberto's y = 4.56 does), a demo
track our own element runs on with WAAPI using the measured timing string, Replay, Slow-mo 10% (duration x10),
a scrubber, and copy buttons for the exact `transition` value or custom properties. The plot's marker follows the
demo. With reduced motion on, clicks jump between start and end, nothing animates, and a note says so. Each
entry links its raw files, served unchanged at `/raw/<site>/<file>`.

- `tests/unit/plot.test.ts`: every plotted point, read back into curve space, matches `bezier-easing` within
  SVG rounding, for 7 curves including two with overshoot. Steps draw as risers and treads.
- `tests/unit/copy.test.ts`: the copy strings.
- `tests/e2e/demo.spec.ts` (desktop and mobile Chromium, 10 passed): the copy button puts
  `transition: transform 1.2s cubic-bezier(0.16, 1, 0.3, 1);` on the clipboard exactly, and the custom-property
  pair; the demo passes through intermediate positions; Slow-mo sets the animation to 12000ms; with
  `reducedMotion: 'reduce'` a click produces no running animation and one constant transform.
- Screenshots: `evidence/m3-entry-cuberto-desktop.png` (full page), `evidence/m3-entry-raycast-mobile.png`.
- `pnpm test`: 72 passed.

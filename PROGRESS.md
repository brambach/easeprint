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

## M4 The other 18 entries

All 20 sites loaded and measured on 2026-10-17: every normal and reduced run returned 200 and `outcome: ok`. No
site was blocked, gone, or WebGL-only to the point of having no DOM motion, so there's no replacement to pick.
Six are marked **partial** because their main motion is somewhere the tool can't read, and each entry says where:

- **vercel.com**: WebGL hero, Rive and Lottie. CSS shows colour, shadow, fades and a marquee only.
- **emilkowal.ski**: the homepage is nearly still; the motion lives in articles and the libraries (Sonner and Vaul
  have their own entries).
- **rauno.me**: two CSS fades; the rest is Framer Motion springs on requestAnimationFrame. Two of three hover
  targets were covered by other elements.
- **darkroom.engineering**: scroll is Lenis, scenes are GSAP and ScrollTrigger, not exposed on `window`.
- **locomotive.ca**: Lenis, GSAP, ScrollTrigger, Barba and three.js, same problem.
- **basement.studio**: two viewport-sized WebGL canvases carry the showpiece motion ("motion lives in canvas").

Changes to the tool made while doing this, all recorded in the raw files:

- `--click <css>` (opt-in): sonner.emilkowal.ski and vaul.emilkowal.ski only animate after a click, so they were
  re-measured clicking their own demo buttons (Render a toast; Open Drawer), then Escape. Still one load per run.
- Tool 1.1 records which properties a CSS animation's keyframes touch, so opacity-only keyframes don't count as
  movement. Cuberto and Raycast were measured with 1.0 and their animations count as movement; neither was
  re-measured, to keep to one load per site per run.
- The reduced-motion verdict compares *movement* events (transform, position, size) between the normal run and
  the reduced run. Fades are allowed under reduced motion. A site that moves nothing gets `no-movement`.

Entries were written from `pnpm summarize` and `pnpm records` output; tier values were copied out of the raw
files by script, so the long `linear()` springs (up to 175 stops) are exact. Every comparative claim in an entry's
notes was checked against all 20 raw files before it went in.

| Site | Status | Posture | Tiers | Statement | Reduced motion | `transition: all` elements |
|---|---|---|---|---|---|---|
| arc.net | measured | material | 5 | none | not-honored (12 to 12) | 0 |
| attio.com | measured | material | 6 | `cubic-bezier(0, 0, 0.58, 1)` 600ms | partial (77 to 22) | 11 |
| basement.studio | partial | ambient, character | 6 | none | not-honored (43 to 43) | 3 |
| brycerambach.com | measured | spatial | 7 | `cubic-bezier(0.2, 0.7, 0.1, 1)` 1.15s | honored (121 to 0) | 0 |
| cuberto.com | measured | material | 5 | `cubic-bezier(0.16, 1, 0.3, 1)` 1.2s | not-honored (148 to 134) | 1 |
| darkroom.engineering | partial | spatial | 4 | none | honored (107 to 0) | 0 |
| emilkowal.ski | partial | material | 2 | none | no-movement (0 to 0) | 0 |
| family.co | measured | material | 5 | `cubic-bezier(0.19, 1, 0.22, 1)` 1s | not-honored (350 to 337) | 123 |
| linear.app | measured | ambient, diagrammatic | 6 | `cubic-bezier(0.25, 0.1, 0.25, 1)` 1000ms | honored (474 to 18) | 2 |
| locomotive.ca | partial | spatial | 5 | none | not-honored (16 to 16) | 0 |
| motion.dev | measured | material | 6 | `linear() spring` 1750ms | honored (6 to 0) | 0 |
| obys.agency | measured | spatial | 5 | `cubic-bezier(0.16, 1, 0.3, 1)` 1.6s | not-honored (65 to 62) | 0 |
| paco.me | measured | spatial | 2 | `ease` 0.6s | honored (8 to 0) | 0 |
| rauno.me | partial | material | 2 | none | no-movement (0 to 0) | 0 |
| raycast.com | measured | material | 8 | `cubic-bezier(0.165, 0.84, 0.44, 1)` 2s | not-honored (84 to 80) | 149 |
| resend.com | measured | material | 8 | `ease-in-out` 1.5s | not-honored (21 to 19) | 16 |
| sonner.emilkowal.ski | measured | spatial | 4 | `ease` 0.4s | partial (8 to 2) | 2 |
| stripe.com | measured | ambient, diagrammatic | 8 | `cubic-bezier(0.165, 0.84, 0.44, 1)` 0.8s | honored (852 to 54) | 0 |
| vaul.emilkowal.ski | measured | spatial | 5 | `cubic-bezier(0.32, 0.72, 0, 1)` 0.5s | not-honored (4 to 4) | 1 |
| vercel.com | partial | ambient, decorative | 6 | none | no-movement (0 to 0) | 13 |

Evidence:

- `tests/unit/entries.test.ts`: the entry sites equal the brief's 20 exactly, and each passes the schema with a
  raw file and a reduced-motion run beside it.
- `tests/unit/trace.test.ts`: all 105 tiers trace to one raw record each (timing, duration, phase, property,
  selector, count). The schema enforces the same at build time.
- `pnpm test`: 203 passed. `pnpm build`: 21 pages. `pnpm lint` clean.

# easeprint plan

Written 2026-10-17. The session didn't start in Plan mode, so per the brief this file is the plan and work continues.

## What changed from the brief

- The repo was empty: no README, no `design/`. TASTE.md, MOTION.md, motion.css, motion/GLOSSARY.md and the
  Cuberto, Raycast, Family and brycerambach.com notes aren't here. Your portfolio cites them at
  `claude-hub/personal-projects/design/`, which is on your laptop. So:
  - No entry carries "from notes" values. Every number comes from a live measurement on 2026-10-17. When you
    drop the notes into `design/motion/`, each entry's `notes` tier can record them beside the measured value.
  - M1's two entries (Cuberto, Raycast) can't be built from notes. M1 ships the schema and its failing-fixture
    test; the two entries land in M2 from measured data.
  - `src/styles/motion.css` is rebuilt from the tiers stated in the brief and marked as a reconstruction.
- Design reference, per your message mid-session: Dervo (`dervo-website`, `dervo`) and the portfolio's
  `docs/site-personality.md`. From Dervo: paper and ink tokens, hairline structure, one 1200px column, pine as the
  single accent, serif only for display, light and dark, the page paints finished, P pauses motion. Type follows
  Dervo: Instrument Serif, Instrument Sans, JetBrains Mono for every value (the brief's fallback was Fraunces,
  Hanken Grotesk and Plex Mono; it's one token block to swap back). Voice follows site-personality.md: no em
  dashes, say what wasn't checked.

## Milestones

| | Scope | Evidence (in PROGRESS.md) |
|---|---|---|
| M0 | Astro static scaffold, TS strict, eslint, stylelint, vitest, Playwright, CLAUDE.md, SessionStart hook | lint, test, build pass |
| M1 | zod schema for entries, trace rules, failing fixture | test: a fixture missing a field fails `astro build` |
| M2 | `pnpm measure <url>`; run on cuberto.com and raycast.com; their two entries | raw JSON committed; test: every curve and duration on an entry appears in its raw file |
| M3 | Curve plot, demo (click, replay, 10% slow-mo, scrub), copy | test: plot points match bezier-easing; e2e: clipboard holds the exact string; screenshot |
| M4 | The other 18 measured and written up | 20 entries pass the schema, each has a raw file, failures listed |
| M5 | Index with mini curves, posture filter, compare overlay, the convention page, site on motion.css | mobile and desktop screenshots, axe clean of serious issues, reduced-motion e2e, stylelint rejects `transition: all` |

## File layout

```
CLAUDE.md  PLAN.md  PROGRESS.md  README.md
.claude/settings.json, .claude/hooks/session-start.sh
scripts/measure.ts            pnpm measure <url>: one load, scroll, hover sample, write raw JSON
scripts/summarize.ts          ranks easing+duration pairs in a raw file, to help write an entry
data/raw/<site>/<date>.json   raw measurements (committed)
src/content.config.ts         the entries collection and its zod schema
src/content/entries/*.json    one entry per site
src/lib/easing.ts             parse cubic-bezier, keywords, linear(), steps(); sample curves
src/lib/schema.ts             zod schema, shared by Astro and tests
src/lib/trace.ts              finds an entry's values in its raw file
src/components/*.astro        CurvePlot, CurveDemo, CopyValue, TierTable, EntryCard
src/scripts/*.ts              islands: demo player, filter, compare
src/styles/motion.css         the house tiers as custom properties
src/pages/                    index, entries/[slug], compare, convention
tests/unit, tests/e2e, tests/fixtures
evidence/                     screenshots referenced from PROGRESS.md
```

## How a value earns its place

The measure tool records what the browser computed: `transition-*` and `animation-*` on every element at load,
after scrolling, and on hovered elements, plus `document.getAnimations()` at each step, keyframe names, and
counts of `prefers-reduced-motion` and `transition: all` in the CSS the page loaded. An entry tier names its raw
file and the exact `timingFunction` and `duration` strings, and a test fails if that pair isn't in the file.

## Risks

- **JS-driven motion** (GSAP tweens, Lenis, Framer Motion springs on rAF) doesn't show in computed styles.
  `getAnimations()` catches WAAPI (Motion uses it where it can). Sites whose motion is rAF-only get an honest
  "motion lives in JS, not measurable from CSS" note, and the fingerprint (gsap, lenis, canvas) is recorded.
- **WebGL sites** (likely cuberto, obys, basement, darkroom): "motion lives in canvas", plus whatever CSS UI
  motion there is.
- **Bot walls** (Cloudflare challenges, Vercel checkpoints): recorded as blocked with the HTTP status.
- **Hover sampling** misses states behind menus or clicks. The note says how many elements were hovered.
- **Hosting:** the repo has no `main` yet. Pushing the session branch makes it GitHub's default branch until you
  create `main`. I won't create `main`.

## Update, 2026-10-17: design-taste

`github.com/brambach/design-taste` now holds what `design/` was meant to: TASTE.md, APPLY.md, tokens, the motion
glossary, `motion/default/motion.css` and the four motion notes. So:

- `src/styles/motion.css` is now that file, byte for byte (the reconstruction is gone). Stylelint skips it; it
  carries a `.t-material` class that transitions shadow and colour, which our own rules don't allow in our CSS.
- The Cuberto, Raycast, Family and brycerambach.com notes (dated 2026-09-01) are in each entry's `fromNotes`, with
  their source path, beside the live values. Obys gets the convention line from the motion default README.
- The convention's four teams are the notes' four: Cuberto, Obys, Family, Raycast.
- Postures follow the motion glossary's definitions; each entry shows the glossary's property-list test as evidence.
- The site follows APPLY.md: nothing moves on load, lifted cards, pine primary buttons, status as glyph plus word,
  quiet lists, no serif on list rows or numbers, plain copy. Type stays Instrument Serif, Instrument Sans and
  JetBrains Mono, APPLY's default pair (TASTE.md records Instrument beating Fraunces for Dervo).

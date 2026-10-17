# easeprint

How 20 real sites move, measured in a browser on 2026-10-17: exact cubic-bezier values and durations read from
computed styles, plotted, rebuilt as demos in our own code, and copyable. Honest notes on reduced motion and
`transition: all`, computed from the raw measurements.

- `pnpm install`, then `pnpm dev` (http://localhost:4321) or `pnpm build` (static output in `dist/`).
- `pnpm test` (vitest), `pnpm test:e2e` (Playwright, desktop and mobile), `pnpm lint`.
- `pnpm measure <url>` measures a site; see `/method/` on the built site for what it does and can't see.

Every value on an entry traces to a file in `data/raw/`; the build fails if it doesn't. `PLAN.md` is the plan,
`PROGRESS.md` the evidence per milestone, `CLAUDE.md` the working rules.

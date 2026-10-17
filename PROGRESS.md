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

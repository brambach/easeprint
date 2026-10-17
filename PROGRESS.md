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
  removing any of 11 entry fields or 7 tier fields fails the schema.
- `pnpm test`: 37 passed.
- The brief's two M1 entries can't come from notes (not in the repo), so Cuberto and Raycast are written in M2 from
  measured data.

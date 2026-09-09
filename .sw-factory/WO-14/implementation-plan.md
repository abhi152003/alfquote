# Implementation Plan: WO-14

**Work Order:** WO-14 — Build the alfquote CLI shell and output contract
**Created At (UTC):** 2026-09-09T04:46:32Z

## Summary

Replace the CLI placeholder with the real product surface: `alfquote discover|assess|quote|swap`
command adapters over the library services, `--format human|json` and `--block` on every
command, documented exit codes, help pages with working examples, fail-closed validation
that never leaks secrets, and dry-run-only `swap`. The CLI contains zero protocol logic —
every behavior delegates to `packages/alfquote` services; the CLI owns parsing, validation,
rendering, and exit codes only.

## Code Reuse And Package Structure

Library (unchanged): `discoverFactoryHooks`, `discoverHookPools`, `assessHook`,
`quoteExactIn`, `planProtectedSwap`, `simulateProtectedSwap`, `serializeResult`,
`errorMessage`, envelopes, `ALLOWLISTED_FACTORY`, `PINNED_POOL_KEY`/`FIXTURE_*` via
`alfquote/phase1` (explicit fixture selection only).

New files in `packages/cli/src/`:

- `args.ts` — tiny hand-rolled parser (no new deps): global flags (`--format`,
  `--block`, `--chain`, `--rpc`, `--help`, `--version`), per-command options, and a
  `Parsed` result that never reads `process.env` directly (env comes in as a record,
  like the Phase 1 scripts).
- `config.ts` — env/option validation: RPC URL (from `--rpc` or `ETHEREUM_RPC_URL`),
  chain must be 1, masked error messages only.
- `exit.ts` — documented exit-code constants: 0 ok, 2 skip, 3 invalid input,
  4 unavailable evidence (error envelopes), 5 blocker (swap allowance blockers),
  6 configuration error, 1 internal error.
- `render.ts` — human renderer (evidence/warnings/blockers/caveats sections) and the
  JSON path (`serializeResult` verbatim, no ANSI, no logs).
- `commands.ts` — the four command adapters building service args from parsed options.
- `main.ts` — routing, help texts with working examples, version, entry guard; the
  exported `runCli(argv, env)` returns the exit code (testable without spawning).

Tests in `packages/cli/test/`: `args.test.ts` (parser), `config.test.ts` (validation +
secret masking), `render.test.ts` (exit codes + JSON stability + redaction),
`commands.test.ts` (adapters over a fake client — verifies delegation, not protocol).

Also: rename `.github/workflows/phase1.yml` → `release-gate.yml` with name `Release
gate` (carry-forward advisory #4); README gains the CLI section (exit codes, examples).

## Components And Flow

```text
main.runCli(argv, env)
  └─ args.parse ─▶ config.load (rpc/chain) ─▶ commands.<cmd> (client + options)
       └─ library service ─▶ CommandResult
            └─ render: json → serializeResult(result) on stdout
                      human → sections (status, evidence, warnings, blockers, caveats)
                 exit code from status + blockers
```

`swap` composes quote → plan → simulate (dry-run only); any `--send`/live flag is
rejected with exit 3. `discover` supports `--fixture <address>` (explicit fixture
selection) and `--pools-for <hook> --from-block <n> [--to-block <n>]` for pool
discovery. `assess` takes `--hook` plus optional `--pool`/`--fixture` context.
`quote` takes `--hook` + `--pool-key` (or `--use-fixture-pool`) + `--amount <n>`
(whole tokens) + `--decimals <n>` (default 6) + `--zero-for-one`.

## Steps

1. Plan; WO-14 → in_progress. 2. Implement args/config/exit/render/commands/main.
3. Tests incl. JSON stability and redaction. 4. CI rename + README. 5. Matrix + gates +
live read-only `alfquote` runs (discover/assess/quote/swap dry-run via node dist).
6. Review round(s); artifacts; in_review; commit + push.

## Testing

`npm run type-check/build/test`, both gates; live read-only CLI runs against mainnet
(built dist, `--format json` + human for each command; swap dry-run from the clean
address must exit 5 with blockers); JSON parse + schema assertions in tests; no ANSI
codes in JSON (regex); masked RPC in every error path.

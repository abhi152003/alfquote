# Implementation Plan: WO-15

**Work Order:** WO-15 — Integrate and document the Phase 2 CLI journey
**Created At (UTC):** 2026-09-09T06:25:06Z

## Summary

Close Phase 2 by connecting the finished library and CLI into one reproducible journey:
an offline end-to-end fixture workflow test (discover → assess → quote → swap dry-run over
a mocked RPC), an opt-in mainnet read-only integration suite driven by the real CLI, the
three carried-forward library advisories, a documented JSON schema for the Phase 3 agent
integration, a docs/ split between product commands and Phase 1 evidence commands, and a
verified clean-checkout + packed-workspace installation run.

## Code Reuse And Package Structure

Reuse: the complete WO-10..14 surface (services, envelopes, `serializeResult`,
`errorMessage`), the CLI `runCli(argv, env, sinks)` testable entry, the shared
`packages/alfquote/test/mockClient.ts` pattern for the offline journey, and
`docs/pins.md` conventions for documentation.

Changes:

- `packages/alfquote/src/discovery.ts` — advisory 1: `Promise.allSettled` for per-hook
  provenance so a failed forward/reverse read still records the surviving half
  (`evidence` keeps the observed side, null on the failed side; provenance stays
  `unknown`). Advisory 2: deduplicate registry×fixture rows — a fixture that is also
  registered is emitted once with `provenance: "factory"` plus a
  `discover/fixture-also-registered` warning naming the overlap.
- `packages/alfquote/src/output.ts` + `result.ts` — advisory 3: `redactRpcSecrets`
  gains an optional pre-parsed userinfo step already present in the URL masking path;
  `errorMessage` stays signature-compatible. The CLI passes its configured RPC URL via a
  new optional `runCli` option so `errorMessage`/render-time redaction covers
  `https://user:pass@host` forms. Library-level: extend `errorMessage(error, extraUrls?)`.
- `packages/cli/src/main.ts` — pass the resolved RPC URL into the redaction set.
- New `packages/cli/test/journey.test.ts` — offline end-to-end: mocked transport, all
  four commands through `runCli` in human and JSON from the same underlying result,
  exit-code assertions (0/2/5), fixture vs factory distinction, warnings preserved.
- New `scripts/integration-mainnet.sh` (opt-in, read-only) — runs the built CLI journey
  against mainnet when `ALFQUOTE_INTEGRATION=1`; NOT part of CI or release.sh (no RPC
  secret in CI), documented in the README.
- Docs: `docs/cli.md` (installation, configuration, commands, JSON schema + examples
  per status, exit codes, troubleshooting, safety); README gains the contract-map
  section per the product blueprint and points Phase 1 evidence commands to their
  preserved paths; `docs/phase1-evidence.md`… — instead: a section inside `docs/cli.md`
  plus README links keep it lean.
- `package.json` — root `smoke` conveniences unchanged; add nothing to CI.

## Components And Flow

```text
journey.test.ts (offline):
  mock transport ─▶ runCli discover --format json ─▶ parse envelope ─▶ factory + fixture rows
                 ─▶ runCli assess (fixture flag)   ─▶ four dimensions, no combined verdict
                 ─▶ runCli quote --exact-in        ─▶ amounts/units/liquidity/warnings
                 ─▶ runCli swap --dry-run          ─▶ blockers + calldata + exit 5
  each step re-runs in human format and asserts the same facts render

integration-mainnet.sh (opt-in):
  node packages/cli/dist/main.js discover/assess/quote/swap against ETHEREUM_RPC_URL,
  asserting exit codes 0/2/5 and JSON validity; read-only; redaction-checked output
```

## Steps

1. Plan; WO-15 → in_progress. 2. Library advisories (allSettled evidence, dedup,
   userinfo redaction) + tests. 3. CLI journey test + RPC-URL redaction wiring.
   4. `scripts/integration-mainnet.sh` + README/docs (`docs/cli.md`, contract map).
   5. Clean-checkout + `npm pack` workspace-install verification, full matrix, gates,
   live read-only smoke. 6. Review round(s); artifacts; in_review; commit + push.

## Testing

- `npm run type-check/build/test`, both gates, plus the new journey + advisory tests.
- Clean-checkout simulation: fresh copy → `npm ci` → matrix → `npm pack
  --workspace alfquote` install into a scratch dir → run the packed CLI (verifies the
  shipped tarball resolves `alfquote/phase1`).
- Live read-only: `ALFQUOTE_INTEGRATION=1 bash scripts/integration-mainnet.sh` with the
  user's env; swap must exit 5 from the clean address; no state-changing RPC anywhere.
- Docs audited for secrets (grep for the configured host/key patterns).

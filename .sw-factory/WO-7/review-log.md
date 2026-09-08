<!--lint disable strong-marker-->

# Review Log: WO-7

**Work Order:** WO-7 — Prove protected DualPool execution on a Tenderly mainnet fork
**Initialized At (UTC):** 2026-09-07T19:06:59Z

This file records review and verification rounds. Append new rounds; do not overwrite prior rounds.

---

## Round 1

Delegate: general-purpose subagent over the uncommitted WO-7 change set (all of
`src/tenderly/`, `scripts/fork-execute.ts`, gate/docs/tests changes, evidence artifacts).

### Requirements Alignment

**Blocking:** none

**Advisory:** none

### Blueprint Alignment

**Blocking:** none

**Advisory:** none

### Architecture And Conventions

**Blocking:** none

**Advisory:**

- `scripts/check-no-send.sh`: `! -name` exclusions match at any depth (a file named `fork-execute.ts` anywhere under `src/` would escape both scopes); unquoted `$mainnet_files`.

### Tests And Build

**Commands run:** `npm run type-check` (clean), `npm test` (86 passed), `bash scripts/check-no-send.sh` (passed)

**Blocking:** none

**Advisory:**

- No regression test asserting config error text never contains a raw endpoint URL.

### User-Facing Verification

**Skipped:** no

**Evidence:** docs/pins.md WO-7 section + docs/fork-evidence.json cross-checked (fork block 25932005, chain 9991, PASS numbers matched); live-run console outputs from the execution session.

**Blocking:** none

**Advisory:**

- Release evidence contains only `*-skipped` setup records (address pre-funded; approvals created in the first run); setup tx ids live in pins.md prose; swap receipt block not serialized; funding narrative quoted first-run balances.

### Security, Privacy, And Data Safety

**Skipped:** no

**Blocking:**

- `src/tenderly/config.ts` `requireHttpUrl`: an unparseable `TENDERLY_ADMIN_RPC_URL` (the common missing-scheme paste error) embedded the raw URL — including its path secret — in the thrown error, which `fork-execute.ts` prints unredacted. Violates "Admin RPC URL never logged".

**Advisory:** none beyond the blocking item.

### Round 1 Verdict

- Total blocking: 1
- Total advisory: 4
- Files reviewed: all WO-7 changed paths (src/tenderly/, scripts/fork-execute.ts, scripts/check-no-send.sh, scripts/release.sh, src/runOptions.ts, package.json, .env.example, README.md, docs/pins.md, docs/fork-evidence.json, five new test files)
- **Verdict: CHANGES_REQUESTED**

Fixes applied for Round 2:

1. Blocking: the unparseable-URL error now prints `maskTenderlyUrl(raw)`; new
   `tenderlyConfig` test asserts no error message contains the raw URL or its
   path key.
2. Gate: exact-path exclusions (`! -path "$root/scripts/fork-execute.ts"`),
   `mapfile` arrays for file lists (no word-splitting); the isolation test now
   excludes the exact fork-script path instead of a suffix match.
3. Evidence: `evidencePath(diagnostic, pass)` — release PASS writes
   `docs/fork-evidence.json`, diagnostics write `fork-evidence-diagnostic.json`,
   failures write `fork-evidence-failed.json` (both non-release files
   gitignored); swap receipt block number serialized in evidence.
4. Live re-run after an idle gap exposed a real transient failure:
   `TransactionDeadlinePassed` (VE stamps blocks with real time; stale
   latest-block timestamp after idle). Diagnosed by eth_call replay
   (`0x5bf6f916`); deadline now `max(latest block ts, wall clock) + 600`
   (`executeDeadline`, unit-tested). Release evidence regenerated (PASS,
   tx `0x19d1aa98…`), pins updated with the caveat.

---

## Round 2

Fresh delegate over the updated change set; verified all five Round 1 fixes
(all confirmed fixed, including empirical gate probes: stray `src/fork-execute.ts`,
admin-method leaks, and send-API leaks in mainnet files each fail the gate).

### Verdict inputs

- Requirements alignment: none
- Blueprint alignment: none
- Architecture and conventions: 1 advisory — Permit2 `minExpiration` derived from the possibly-stale head-block timestamp (same staleness family as the deadline bug; clean revert on failure, not a false PASS). Header comment still named `tenderly_getSyncStatus`.
- Tests and build: 1 advisory — no direct unit test for `evidencePath` routing or the `receiptBlock` field (both verified end-to-end by the delegate).
- User-facing verification: 1 advisory — pins.md `amountOutMinimum` for the 1 USDC release run read `995167`; the recorded evidence and the floor convention say `995166` (PASS unaffected).
- Security, privacy, and data safety: none — repo-wide scan found no raw endpoint URL or path key in any artifact; evidence passes `assertNoEndpointSecrets`; diagnostic artifact gitignored; CI secret-free.

### Commands run

`npm run type-check` (clean), `npm test` (88 passed), `bash scripts/check-no-send.sh` (passed)

### Round 2 Verdict

- Total blocking: 0
- Total advisory: 3
- **Verdict: APPROVED**

Advisory fixes applied after approval (all three):

1. pins.md `amountOutMinimum` corrected to `995166` (both tables).
2. `adminClient.ts` header comment updated to the real probe (`evm_getLatest`).
3. `fork-execute.ts` guards `run()` behind an entry-point check and exports
   `evidencePath` for tests; setup `now` is `max(head timestamp, wall clock)`;
   new tests cover `evidencePath` routing and the serialized `receiptBlock`.
   Suite now 90 tests, all passing.

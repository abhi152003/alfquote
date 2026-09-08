<!--lint disable strong-marker-->

# Review Log: WO-9

**Work Order:** WO-9 — Establish the ALFQuote workspace and public contracts
**Initialized At (UTC):** 2026-09-08T17:54:38Z

This file records review and verification rounds. Append new rounds; do not overwrite prior rounds.

---

## Round 1

Delegate: general-purpose review subagent (fresh context, read-only), full WO-9 change set (79 paths vs HEAD 59fa267, uncommitted on main).

### Requirements Alignment

**Blocking:**

- B-1: `src/index.ts` left over from the pre-workspace layout — tracked, byte-identical to HEAD, dead module with dangling imports (`./config.js` etc. moved to `scripts/lib`), re-exposing interface-layer concerns at the old import path; ships to fresh checkouts. Fix: `git rm src/index.ts`. (All 8 WO-9 requirements otherwise CONFIRMED by the delegate — see verdict.)

**Advisory:**

### Blueprint Alignment

**Blocking:**

**Advisory:**

### Architecture And Conventions

**Blocking:**

**Advisory:**

- A-1: `scripts/check-package-boundaries.sh` pattern gaps (verified by seeded violations in a sandbox): `process.stdout.write` passes (only `process.env|argv|exit` banned); `node:child_process`/`node:path`/`node:http` imports pass (only fs/os/process enumerated); non-`.ts` files unscanned (mitigated: tsconfig.build includes only `src/**/*.ts`).
- A-2: `check-no-send.sh` mainnet scan is a closed allowlist of four trees; a stray `*.ts` dropped directly under `scripts/` (outside phase1/lib/tenderly) escapes the gate. Suggested: fail-closed stray-file assertion.
- A-3: `libraryBoundaries.test.ts` "no combined safe" test only asserts a comment string; real enforcement is the compile-time exact-keys assignment + export allowlist.

### Tests And Build

**Commands run:** `npm run type-check`, `npm run build`, `npm test` (106/106, 19 files), `bash scripts/check-no-send.sh`, `bash scripts/check-package-boundaries.sh` (all pass); independent clean-checkout simulation in /tmp (`npm ci` → full matrix → `node packages/cli/dist/main.js`, all pass); rename-following diffs of all 16 modified-after-move files confirmed import-only changes (only behavior-relevant hunk: `fork-execute.ts` `../docs/` → `../../docs/` depth fix); boundary-gate negative tests (nested violations caught; A-1 gaps confirmed).

**Blocking:**

**Advisory:**

### User-Facing Verification

**Skipped:** no — non-browser CLI/evidence output.

**Evidence:** delegate re-ran `npm run spike` (16/16 checks, exit 0) and `npm run proof` (PROCEED, exit 0) live through the workspace; `npm run simulate` executed the full pipeline and exited 1 at its designed fail-closed point (`AllowanceExpired(0)`, correctable) because `ALFQUOTE_SIMULATION_FROM` is the intentionally mainnet-clean controlled-fork address — judged an environment artifact, not a WO-9 regression (`simulate` was never in `scripts/release.sh`; verified against `git show HEAD:scripts/release.sh`).

**Blocking:**

**Advisory:**

- A-4: optionally document in README that `simulate` needs a funded/allowanced mainnet sender.

### Security, Privacy, And Data Safety

**Skipped:** no.

**Evidence:** no secrets in tracked files (masked endpoints, public pinned constants); `.env` untouched; no-Tenderly gate covers all product+phase1+lib files; boundary gate fails closed; no cross-package deep imports; no circular imports.

**Blocking:**

**Advisory:**

### Round 1 Verdict

- Total blocking: 1 (B-1)
- Total advisory: 5 (A-1 pattern gaps, A-2 closed allowlist, A-3 weak assertion, A-4 README note, plus the B-1-associated surface caveat)
- Files reviewed: full 79-path change set + HEAD comparisons
- **Verdict:** CHANGES_REQUESTED — fix B-1; A-1/A-2 hardening applied in Round 1 fixes given their cheapness; A-3 strengthened; A-4 documented.

---

<!-- Subsequent rounds: copy the structure above and increment the round number. -->
## Round 2

Delegate: fresh general-purpose review subagent (read-only), verifying the Round 1 fixes plus a full re-run of the matrix.

### Fix verification (all CONFIRMED by the delegate)

- B-1: `src/index.ts` deleted (`D src/index.ts`, `ls src` fails); no references to the old path remain.
- A-1: bare `process\.` and `from "node:` bans in place; delegate independently negative-tested `process.stdout.write` and `node:child_process` seeds in a /tmp sandbox copy — both fail the gate.
- A-2: fail-closed stray `scripts/*.ts` assertion in `check-no-send.sh`; sandbox `touch scripts/stray.ts` fails the gate.
- A-3: test now asserts the runtime `HOOK_ASSESSMENT_KEYS` equals exactly the four dimensions.
- A-4: README documents the `simulate` sender requirements and why the controlled-fork address fails it.

### Tests And Build

**Commands run:** `npm run type-check` (pass), `npm run build` (pass), `npm test` (107/107, 19 files), both gates (pass); `git diff HEAD --stat -- docs/` empty (evidence docs untouched); secrets scan clean; no cross-package deep imports; sandbox negative tests as above.

### New findings

- N-1 (advisory): single-quoted builtin imports (`from 'node:child_process'`) still evaded the pattern (delegate sandbox-verified). **Applied immediately after the verdict:** pattern now matches either quote style (`from ['"]node:`, `from ['"](fs|...)['"]`), mirrored in `libraryBoundaries.test.ts`; re-negative-tested all three variants (single-quote `node:`, double-quote `node:`, single-quote bare `fs`) — all fail the gate; clean tree passes; 107/107 tests.

### Round 2 Verdict

- Total blocking: 0
- Total advisory: 1 (N-1, fixed and verified post-verdict)
- Files reviewed: full change set (80 paths) + sandbox probes
- **Verdict:** APPROVED

---

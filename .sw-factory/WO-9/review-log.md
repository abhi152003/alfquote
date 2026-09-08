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
## Round 3 (correction pass)

Delegate: fresh general-purpose review subagent (read-only), verifying the seven user-required corrections to commit 02ae0bb.

### Fix verification (all seven CONFIRMED by the delegate)

1. Manifest `types` targets → emitted declarations (dist d.ts for main, phase1, and CLI); zero remaining source-type targets; root `type-check` builds the library first so `npm ci && npm run type-check` still works.
2. Canonical serializer (`serialize.ts`): delegate probed built dist — bigint→decimal string (incl. negative), undefined-prop dropping, undefined array slots/sparse holes → null, Date/Map/Set/class instances/functions/symbols throw; envelope round-trips JSON.parse.
3. `PoolId` defined in `pool.ts` and used across quote/swap/assessment inputs and the fixture constants.
4. `NamespacedCode` types all three envelope code fields; `COMMON_ERROR_CODES` registry + `isNamespacedCode` validator tested.
5. `alfquote/phase1` subpath: fixture constants physically relocated, diagnostic and `runProtectedSimulation` served only from phase1 (absent from main index and dist d.ts), `quoteFillGapBps` stays main; runtime import resolves exactly the 10 pinned names.
6. WO-12/WO-13 ownership documented at the fixture-adapter lock site.
7. `test/surface/` splits allowlists by owner; the barrel-union test empirically catches value-name collisions (ESM `export *` drops them; union keeps them); no phase1 name leaks into the main entry.

Also verified: `docs/fork-evidence.json` zero diff; pins.md exactly 3 path lines changed; every script fixture import resolves from `alfquote/phase1`; no import cycles; gates cover phase1.ts.

### New findings (none blocking; dispositions)

- A-1 (advisory, serialize.ts): `instanceof Object` made the null-prototype acceptance dead code. **Fixed:** dispatch on `typeof value === "object"`; regression test with `Object.create(null)` added; re-verified.
- A-2 (advisory, barrel.test): collision detection is value-only (type-only name collisions invisible to `Object.keys`). **Accepted as-is** for now: type-only collisions would surface immediately in downstream consumers' type-checks; revisit if WO-10..13 export overlapping type names.
- A-3 (advisory, phase1.ts): WO numbers now named in the header at the lock site. **Fixed.**
- A-4 (advisory, implementation-plan.md): superseded markers added inline at the pre-correction rationale so a future agent cannot re-apply the rejected `src` types design. **Fixed.**
- I-1 (info): stale local `dist/protectedSim.js` from the incremental build — **removed** via clean rebuild (gitignored artifact; absent from fresh checkouts).

### Round 3 Verdict

- Total blocking: 0
- Total advisory: 4 (3 fixed post-verdict, 1 accepted with rationale)
- Files reviewed: full correction diff vs 02ae0bb
- **Verdict:** APPROVED

---

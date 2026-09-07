<!--lint disable strong-marker-->

# Review Log: WO-6

**Work Order:** WO-6 — Close the Phase 1 simulation and reproducibility gaps
**Initialized At (UTC):** 2026-09-07T14:41:29Z

This file records review and verification rounds. Append new rounds; do not overwrite prior rounds.

---

## Round 1

### Requirements Alignment

**Blocking:**

- `docs/pins.md` — intended 1 USDC pin had nested `inputs` but not outer `execute` calldata.

**Advisory:**

- Decision not the last line of the pin file.
- 1/5/10 USDC fills reported as min-out passed, not measured actualOut.
- `release.sh` omitted `npm ci`.

### Blueprint Alignment

**Blocking:** none

**Advisory:** checked-in IALFHook copy is stripped of NatSpec.

### Architecture And Conventions

**Blocking:** none

**Advisory:** spike ERC-165 strings said latest-state when a block was pinned.

### Tests And Build

**Commands run:** `npm test` (58 passed), `npm run type-check`, `bash scripts/check-no-send.sh`

**Blocking:** none

### User-Facing Verification

**Skipped:** no

**Evidence:** README, pins, live spike/proof/sweep at 25926196.

**Blocking:** none beyond pins calldata.

### Security, Privacy, And Data Safety

**Skipped:** no

**Blocking:** none

### Round 1 Verdict

- Total blocking: 1
- Total advisory: 11
- **Verdict:** CHANGES_REQUESTED

Fix applied: exact `calldata=0x3593564c…` for the 1 USDC / 50 bps / block `25926196` pin; `npm ci` in `release.sh`; pinned-block labels; pin file ends with **Phase 1 decision: REVISE.**

---

## Round 2

### Requirements Alignment

**Blocking:** none. Intended-sim `calldata` selector `0x3593564c`, deadline `6a9ed223` = `1788793379`. Truncated `inputs=` nibble fixed after the round (1666 hex chars).

### Blueprint Alignment

**Blocking:** none

### Architecture And Conventions

**Blocking:** none

### Tests And Build

**Commands run:** `npm test` (58 passed), `npm run type-check`, `bash scripts/check-no-send.sh`

**Blocking:** none

### User-Facing Verification

**Skipped:** no

**Evidence:** pins intended-sim section, `release.sh` with `npm ci` and `simulate --amount 1`.

### Security, Privacy, And Data Safety

**Skipped:** no

**Blocking:** none

### Round 2 Verdict

- Total blocking: 0
- Total advisory: 5 (residual)
- **Verdict:** APPROVED

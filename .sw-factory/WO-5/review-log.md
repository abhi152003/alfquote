<!--lint disable strong-marker-->

# Review Log: WO-5

**Work Order:** WO-5 — Harden Phase 1 evidence and add the release gate

This file records review and verification rounds. Append new rounds; do not overwrite prior rounds.

---

## Round 1

**Verdict:** CHANGES_REQUESTED

**Blocking:** `docs/pins.md` did not include the exact simulated calldata.

**Advisory:** dual hookData caveat; npm install vs npm ci; no GO/NO-GO sentence; thin nested revert tests; v2.1.1 encoder still public.

---

## Round 2

Blocking item fixed: pins.md now records encoding, commands, deadline, inputs, and calldata for the WO-5 simulate run. Caveats no longer require both hookData encodings as a Phase 1 path.

**Blocking:** none

**Advisory:** WO-3 still in_review in Software Factory; diagnostic helpers remain in library; simulate exits 1 on expected min-out revert.

- Files reviewed: Phase 1 re-run section + caveats + encoder tests
- **Verdict:** APPROVED

---

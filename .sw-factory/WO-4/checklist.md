<!--lint disable no-undefined-references strong-marker-->

# Work Order Execution Checklist: WO-4

**Work Order Number:** WO-4
**Work Order Title:** Simulate a protected Universal Router swap
**Initialized At (UTC):** 2026-09-07T09:37:23Z

## Phase 1: Start / Context Gathering

### Required Steps

- [x] Review work order description provided by MCP tool output
  Read via `read_work_order` (WO-4, id e4958419-8842-419a-9eef-a606d14a0ead): dry-run Universal Router V4_SWAP with empty hookData, explicit min-out, inspect allowances, simulate, never send.
- [x] Identify linked requirements and blueprints
  Three linked KB blueprints (same as WO-1–3); no requirements documents linked.
- [SKIP] Review every connected requirements document
  Skip reason: WO-4 links no requirements documents; acceptance criteria are in the Work Order description.
- [x] Review every connected blueprint document
  Read Universal Router / Permit2 / simulate sections of ALFQuote.md and Uniswap Internals (KB).
- [x] Follow `@…` mentions **and links** to other blueprints in linked documents and read each referenced blueprint via MCP
  The three linked documents reference only each other.
- [x] Review every referenced blueprint discovered that way; add them to **Referenced Blueprints** in `context.md`
  No referenced blueprints beyond the three linked ones.
- [x] Extract acceptance criteria from requirements
  Verified hook/PoolKey; empty hookData; explicit amountOutMinimum; missing balance/allowance reported not bypassed; success records output+gas; failure records decoded revert and correctable vs not; no broadcast.
- [x] Identify architecture path from blueprints (components, contracts, composition)
  UR command 0x10 V4_SWAP; actions SWAP_EXACT_IN_SINGLE / SETTLE_ALL / TAKE_ALL; Permit2 two-layer allowances; quote then slippage then simulate. Deployed UR 0x66a9… is v2 (no minHopPriceX36).
- [x] `context.md` is filled or updated with `execution/scripts/update-context-index.sh` for Work Order, connected requirements, connected blueprints, referenced blueprints, and known delivery links
  Ran with all three linked blueprints and status in_progress.

- [x] **Certification: Phase 1 complete. Proceeding to Phase 2.**

## Phase 2: Planning And Implementation

### Implementation Plan

(see `execution/writing-implementation-plans.md`)

- [x] Implementation plan documented in `implementation-plan.md`
- [x] Testing section documented in `implementation-plan.md`

### Implementation

- [x] Implemented changes are scoped to the Work Order
  Encode + dry-run only. No send, no approve. Files: v4Swap, allowances, simulateSwap, simulate-swap.ts, ABI pins, pins.md WO-4 section.
- [x] Tests added or updated for changed behavior
  `test/v4Swap.test.ts` plus ABI equivalence for UR/Permit2/ERC20. 42/42 tests; `tsc --noEmit` clean.
- [x] Documentation, generated files, fixtures, migrations, or config updated where relevant
  pins.md records 50 bps `V4TooLittleReceived(99496371, 72792356)` and 3000 bps `AllowanceExpired(0)`. README + `.env.example`.

- [x] **Certification: Phase 2 complete. Proceeding to Phase 3.**

## Phase 3: Review And Verification

### Review

- [x] Review subagent spawned per `execution/review-phase.md` and returned a verdict
  Dedicated delegate **APPROVED** (0 blocking, 8 advisory). See `review-log.md` Round 1.
- [x] All acceptance criteria from the Work Order and linked requirements are satisfied
  Pinned pool/hook; empty hookData; explicit min-out; allowances reported not bypassed; revert decoded; no broadcast.
- [x] Architecture is aligned with linked blueprints, or documented drift is accepted
  UR v2 encoding at 0x66a9…; v2.1.1 retry only if v2 fails the whole execute. DualPool quote vs execution gap recorded.
- [x] Exploratory pass on user-facing or external behavior — not only automated tests; for browser apps, use browser-based testing if available. Brief notes in `review-log.md` or evidence.
  Not a browser app. Live `npm run simulate` evidence in pins.md.
- [x] Latest `review-log.md` verdict is `APPROVED`

- [x] **Certification: Phase 3 complete. Proceeding to Final Completion.**

## Final Completion Check

- [x] All phase certifications above are complete
- [x] Checklist is fully filled out with evidence
- [x] Review log is complete (`review-log.md`)
- [x] Implementation plan was followed (`implementation-plan.md`)
- [x] All intended files are present in the working tree
  Version-control handoff awaits user direction.
- [x] Work order status updated to `in_review`

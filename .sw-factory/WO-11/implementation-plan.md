# Implementation Plan: WO-11

**Work Order:** WO-11 — Implement structured hook assessment
**Created At (UTC):** 2026-09-08T20:07:39Z

## Summary

Implement `assessHook` in `assessment.ts` (WO-11's module): an envelope-returning service
that reports compatibility, provenance, routing, and upgradeability as independent,
evidence-backed `AssessmentField` values — with no combined `safe`, score, or allowlist
verdict anywhere. Conservative by construction: missing code, failed reads, and unknown
patterns produce uncertainty (`unverified`/`unknown`), never a favorable result.

Blueprints: Phase 2 plan (40e5f328 — structured assessment boundary) and product
blueprint (5ece3519 — the four dimensions' semantics, policy triggers, proxy rules,
"hooklist is not an authority").

## Code Reuse And Package Structure

Reuse:

- `AssessmentField`, `HookAssessment`, the four status unions, `HOOK_ASSESSMENT_KEYS`
  (WO-9 types, extended in place — this module owns them)
- `supportsInterface` (ERC-165), `hasBytecode`, `factoryProvenance`, `reverseProvenance`
  (discovery/hookChecks primitives — the "reuse discovery evidence" requirement)
- `readLiveness`, `readMaxGas` (IALFHook view surface checks)
- `errorMessage`, `okResult`/`errorResult`, `ChainBlockContext`, `COMMON_ERROR_CODES`
- `ALLOWLISTED_FACTORY`, `IALFHOOK_INTERFACE_ID`, `IERC165_ID` (computed via
  `interfaceIdOf`), `USDC`, `POOL_MANAGER` addresses

New in `src/assessment.ts`:

- `ASSESS_ERROR_CODES` / `ASSESS_WARNING_CODES` registries (`assess/*`)
- `AssessOptions` (service args: hook, poolId?, poolKey?, fixture?, factory?,
  majorPairs?, blockNumber?) — `AssessInput` stays the envelope summary
- `EIP1967_SLOTS` (implementation/beacon/admin), `EIP1167_PREFIX` constants
- `assessCompatibility`, `assessProvenance`, `assessRouting`, `assessUpgradeability`
  (internal per-dimension builders) + public `assessHook(client, options)`
- `WETH` documented address constant (major-pair default policy input)

Tests: `packages/alfquote/test/assessmentService.test.ts` (mock client) +
`test/surface/assessment.test.ts` allowlist update (module gains value exports).

## Components And Flow

```text
assessHook:
  chain guard (shared rpc/chain-mismatch / rpc/read-failed)
  compatibility: bytecode → ERC-165 base → IALFHook id → required views
      (maxGas, isLive, livePools(poolId) when a pool is given)
      any hard failure → unsupported; any read throw → unverified (evidence kept)
  provenance: fixture flag → "fixture"; else two-way factory reads
      agree → factory; disagree/fail → unknown (never extends to other risk claims)
  routing: policy evaluation on hook address prefix (0x91), dynamic-fee flag on
      the pool key's fee, and configured major pairs (default WETH/USDC);
      any trigger → manual-review; insufficient inputs → unknown; else automatic
  upgradeability: EIP-1967 implementation/beacon/admin slots + EIP-1167 bytecode
      prefix + ERC-1822-beacon-style extra slots; hit → detected;
      read failure → unverified; clean → not-detected with an explicit
      "cannot prove immutability" evidence note
  ok(HookAssessment) — four independent fields; warnings summarize read failures
```

Envelope: `command: "assess"`, input `{ hook, poolId? }`; statuses only ever take their
declared enum values (tests must cover every public enum value per the WO).

## Steps

1. Plan (this file), context updated, WO-11 → in_progress.
2. Implement `assessment.ts` service + constants.
3. Tests: every enum value across the four dimensions, conservative failures
   (missing code, storage-read throw, unknown routing inputs), fixture path,
   0x91-prefix and major-pair triggers, 1967/1167 detections, pinned blocks.
4. Full offline matrix + gates; live read-only assessment of the fixture hook and a
   factory hook on mainnet (one-off script, deleted after).
5. Review delegate round(s); `.sw-factory/WO-11/` artifacts; WO-11 → in_review; commit.

## Testing

- `npm run type-check`, `npm run build`, `npm test`, both gates.
- Live read-only: `assessHook` against the fixture hook (expect compatibility
  supported, provenance fixture when flagged / unknown when not, routing from policy,
  upgradeability not-detected-or-unverified) and a registry hook (provenance factory)
  at a pinned block; canonical serializer output recorded in the checklist.
- Boundary invariants: no env/argv/console/exit, no signers, no broadcasts, no
  controlled-fork references; `hooklist` never fetched (no catalog reads at all).

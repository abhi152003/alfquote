# Review Log: WO-8

**Work Order:** WO-8 — Regenerate a complete Tenderly execution evidence chain

## Round 1

### Findings addressed

- Hardened unexpected Tenderly transport-error redaction.
- Added strict state-fingerprint origin verification and recorded both re-sealed block hashes as identifiers.
- Required six consecutive PoolManager pool-state words and all six contract bytecodes to match mainnet at the origin block.
- Required output balance/log reconciliation, exact input spend, PoolManager Swap evidence, and DualPool liquidity-change evidence.
- Added strict evidence-shape validation for fresh funding, normal approvals, swap trace, and public evidence URL.
- Regenerated the artifact on a fresh environment with funding and approvals in one chain.

### Live verification

- Origin block: `25933348`.
- Funding: `tenderly_setBalance` and `tenderly_addErc20Balance`, both with returned identifiers.
- Approvals: normal USDC and Permit2 transactions in blocks `25933351` and `25933352`.
- Swap: transaction `0x8dc88aa814a62a6cd09c515c66baae61226229dfe7cbcc6d7ac87aa96840f027`, success in block `25933353`.
- Quote/minimum/actual: `1000194 / 995193 / 1000194`.
- Gas: `1670415`.
- Output measurements reconcile and six hook `ModifyLiquidity` events are recorded.
- Public/read-only Tenderly explorer link is included in the artifact.
- Mainnet replay at the origin block remains PROCEED with vanilla liquidity `L=0`.

### Requirement revision

Tenderly re-seals blocks, so literal fork/mainnet block-hash equality is impossible. The revision in `docs/wo-8-revision.md` replaces it with bytecode and six-word storage equality at the origin block. Both hashes remain recorded as identifiers. Timestamp-derived reserve views are informational only.

### Verification

- Offline CI: clean install, type-check, build, tests, and no-send boundary passed.
- Release artifact contains no configured endpoint URL or path secret.
- `docs/pins.md` and `docs/fork-evidence.json` describe the same run.

**Verdict: APPROVED**

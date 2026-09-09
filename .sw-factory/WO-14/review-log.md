<!--lint disable strong-marker-->

# Review Log: WO-14

**Work Order:** WO-14 — Build the alfquote CLI shell and output contract
**Initialized At (UTC):** 2026-09-09T04:46:32Z

This file records review and verification rounds. Append new rounds; do not overwrite prior rounds.

---

## Round 1

### Requirements Alignment

**Blocking:**

**Advisory:**

### Blueprint Alignment

**Blocking:**

**Advisory:**

### Architecture And Conventions

**Blocking:**

**Advisory:**

### Tests And Build

**Commands run:**

**Blocking:**

**Advisory:**

### User-Facing Verification

**Skipped:** _yes/no_ - _reason if yes_

**Evidence:**

**Blocking:**

**Advisory:**

### Security, Privacy, And Data Safety

**Skipped:** _yes/no_ - _reason if yes_

**Blocking:**

**Advisory:**

### Round 1 Verdict

- Total blocking:
- Total advisory:
- Files reviewed:
- **Verdict:** _APPROVED or CHANGES_REQUESTED_

---

## Round 1

Delegate: general-purpose review subagent (fresh, read-only). All ten requirements PASS (executable resolution, four commands, global options, versioned JSON valid on skip/error, sectioned human output, dry-run-only swap with rejected send options, masked config errors, documented exit codes, full delegation to the library with viem confined to interface plumbing, help pages with working examples verified against dist). **Verdict: APPROVED** with seven advisories — all applied post-verdict: (1) bare invocation now prints help to stdout before commander's error path (isolated-sinks test added); (2) commander's duplicate invalid-input stderr line suppressed; (3) `exitCodeFor` exported and unit-tested (ok/skip/error/swap-blockers); (4) `viem` declared in the CLI package dependencies; (5) stale docs fixed (pins.md workflow path, README status lines); (6) pool scans now reject ignored `--fixture`/`--block` combinations; (7) engines raised to node >=22.12.0 matching commander 15. Final matrix: type-check, build, 221/221 tests, both gates, and live mainnet runs (discover human, assess JSON pinned, quote exit 0 in both formats, swap exit 5 with decoded blockers, stale-block skip exit 2, invalid input exit 3, bare invocation help exit 0).

<!-- Subsequent rounds: copy the structure above and increment the round number. -->

## Round 2 (orchestrator correction pass)

Orchestrator review of 151c102: strong overall; two blocking corrections required.

- **B1 (PoolId validation):** `quote --pool` promised validation against the derived PoolId but passed it through to the service, allowing one PoolKey to be combined with another PoolId. **Fixed:** `assertPoolIdMatches` in commands.ts rejects mismatches before any RPC reads (exit 3, "refusing to mix identities"); the same check guards `assess --use-fixture-pool --pool`. Tests: fixture mismatch, explicit-pool mismatch, and matching-id acceptance.
- **B2 (hardcoded USDC label):** `allowanceBlockers` printed "sender USDC balance …" for arbitrary input tokens. **Fixed:** the message now carries the actual token address; non-USDC regression test added; swap/CLI test expectations updated.

Non-blocking items applied: README node requirement 22.9 → 22.12; behavioral exit-1 test (failing output sink → sanitized "internal error", no key echo — output writes now guarded inside runCli); swap direction limitation documented in the swap help and README; exact calldata shown in human swap output. Advisories #1–3 (discovery allSettled, fixture dedup, userinfo-redaction input) carried to WO-15. Post-fix matrix: type-check, build, 226/226 tests, both gates, live verification of both corrections through the built CLI.

**Verdict: corrections complete; awaiting orchestrator re-check.**

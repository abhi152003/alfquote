<!--lint disable no-undefined-references strong-marker-->

# Implementation Plan: WO-7

**Work Order:** WO-7 — Prove protected DualPool execution on a Tenderly mainnet fork
**Created At (UTC):** 2026-09-08

## Summary

Add a Tenderly Virtual TestNet (Virtual Environment) execution path that completes the protected
1 USDC DualPool swap which the read-only mainnet wallet could not (missing Permit2 approvals).
The fork path injects controlled balances and approvals, runs the exact pinned Universal Router
v2 encoding with empty `hookData` and a 50 bps bound, and records setup separately from
execution. Mainnet scripts stay read-only and unchanged in behavior; the no-send gate is
extended (not weakened) with an explicit Tenderly boundary. PASS flips the Phase 1 decision from
REVISE; a swap failure with valid prerequisites keeps REVISE or records NO-GO with the decoded
failure.

Tenderly facts pinned from docs.tenderly.co (2026-09-08):

- Two endpoints per environment: **Public RPC** (standard JSON-RPC) and **Admin RPC**
  (adds cheatcodes). Admin URL is a secret: never committed, logged, or exported.
- Admin methods available: `tenderly_setBalance` (native ETH),
  `tenderly_addErc20Balance` (ERC-20, emits synthetic Transfer),
  `tenderly_setErc20Balance`/`tenderly_setMaxErc20Balance` (no Transfer event),
  `tenderly_setStorageAt` (raw slot), `tenderly_getSyncStatus` (harmless liveness probe),
  and **unsigned `eth_sendTransaction`** (any `from`; no signing keys needed).
- A fresh fork starts from the **latest** parent block (no historical fork-block field);
  chain id is configurable at creation (unique id recommended). The origin block is
  therefore recorded as the head at fork time and cross-verified against mainnet archive
  state — the blueprint explicitly allows refreshing the recorded block.

## Code Reuse And Package Structure

Reuse the encoder (`src/v4Swap.ts`), quote path (`src/alfQuote.ts`), allowance reads
(`src/allowances.ts`), addresses/pins (`src/addresses.ts`), and output redaction
(`src/output.ts`). New code lives in a dedicated `src/tenderly/` subtree that mainnet
modules never import.

| Path | Change |
| --- | --- |
| `src/tenderly/config.ts` | `loadTenderlyConfig`: explicit tenderly mode, required public/admin RPC URLs, expected chain id, fork block, dedicated `from` address; fail-closed validation; both URLs redacted in every log/error |
| `src/tenderly/adminClient.ts` | Admin RPC adapter: endpoint verification via `tenderly_getSyncStatus` (fail closed before any mutation), `tenderly_setBalance`, `tenderly_addErc20Balance`, `tenderly_setStorageAt` (disclosed fallback only), unsigned `eth_sendTransaction`, receipt waiting |
| `src/tenderly/forkVerify.ts` | Fork identity proof vs mainnet archive at the recorded block: chain id, head/origin block, bytecode of PoolManager/hook/UR/Permit2/USDC/USDT, pool state slot word, PoolKey/PoolId equality; refuses `ETHEREUM_RPC_URL` sharing a host with the Tenderly URLs |
| `src/tenderly/forkSetup.ts` | Funding + approvals as **normal contract transactions** (USDC `approve(Permit2)`, Permit2 `approve(USDC, UR, amount, expiration)`); each action returns a record (kind, tx hash, status, gas); storage-override fallback recorder (contract, slot, old, new, reason, verification read) |
| `src/tenderly/forkSwap.ts` | Quote on the fork, encode via existing `encodeV4ExactInSingleExecute` (v2, empty `hookData`, 50 bps), execute, measure actual output (balance delta + receipt logs), decode Swap/ModifyLiquidity/Transfer logs for hook-callback and settlement evidence, PASS/FAIL |
| `src/tenderly/evidence.ts` | Machine-readable evidence object (fork block, chain id, env id, setup records, swap record, gas, quote/minOut/actualOut) with admin URL excluded; write `docs/fork-evidence.json` |
| `scripts/fork-execute.ts` | CLI: verify → fund → approve → swap (default 1 USDC) → evidence; exit 0 only on PASS |
| `scripts/check-no-send.sh` | Scope forbidden patterns to mainnet-path files; **add** Tenderly boundary checks: admin method names only in `src/tenderly/` + fork script; no mainnet file imports `src/tenderly/` |
| `package.json` | `npm run fork` (and `fork:diagnostic` for 5/10 USDC repeats) |
| `.env.example`, `README.md`, `docs/pins.md` | Tenderly vars + labeled mainnet vs controlled-fork evidence + final decision |
| `scripts/release.sh` | Gate becomes the fork execution (mainnet spike/proof stay in the sequence; CI unchanged, no secrets) |
| `test/tenderlyConfig.test.ts` | Fail-closed validation, redaction, mode requirement |
| `test/tenderlyIsolation.test.ts` | Admin helpers unreachable from the mainnet path; import-graph boundary; mainnet client still asserts chain 1 |
| `test/forkEvidence.test.ts` | Setup/swap separation in evidence records; admin URL absent; fork-origin decision logic |

## Components And Flow

```
loadTenderlyConfig (explicit mode; fail closed)
  -> forkVerify: chain id == expected; fork head == TENDERLY_FORK_BLOCK (static fork)
       else state fingerprint vs ETHEREUM_RPC_URL archive at that block
       (bytecode x6 + pools[poolId] slot + PoolKey/PoolId); admin endpoint verified
  -> setup (recorded, separate):
       tenderly_setBalance(from, ETH)                        [admin cheatcode]
       tenderly_addErc20Balance(USDC, from, amount)          [admin cheatcode]
       USDC.approve(Permit2, max)        via eth_sendTransaction (normal tx)
       Permit2.approve(USDC, UR, amt, exp) via eth_sendTransaction (normal tx)
  -> swap: quote on fork -> amountOutMinimum = quote - 50 bps
       -> UR v2 execute via eth_sendTransaction (normal tx)
       -> receipt.status == 1 && actualOut >= amountOutMinimum  => PASS
  -> evidence JSON + pins.md section + Phase 1 decision
```

Storage override (`tenderly_setStorageAt`) is implemented only as a disclosed fallback behind
an explicit flag, with a full override record; it is not on the default path.

## Steps

1. **Tenderly config** — `src/tenderly/config.ts` + `test/tenderlyConfig.test.ts` (validation, redaction, mode).
2. **Admin adapter** — `src/tenderly/adminClient.ts`: endpoint verification + cheatcodes + unsigned send + receipt wait; tests refuse unverified endpoints.
3. **Fork verification** — `src/tenderly/forkVerify.ts` + tests (origin decision logic, same-host guard, bytecode fingerprint).
4. **Setup module** — `src/tenderly/forkSetup.ts`: fund/approve with per-action records; override recorder; tests for record separation.
5. **Swap module** — `src/tenderly/forkSwap.ts`: reuse quote + encoder; measure output; decode logs; PASS/FAIL + tests.
6. **CLI + gate** — `scripts/fork-execute.ts`, `npm run fork`, `src/tenderly/evidence.ts`; re-scoped `scripts/check-no-send.sh`.
7. **Docs** — `.env.example`, README, pins.md structure; `scripts/release.sh` gate update.
8. **Live run** — user provides the Virtual Environment + `.env`: verify → fund → approve → 1 USDC swap; then 5 and 10 USDC where time permits; record evidence + public link/exported trace.
9. **Decision + reconciliation** — final Phase 1 decision from combined evidence; reconcile WO-6/WO-7 statuses.

Steps 1–3 are parallelizable; 4–5 depend on 1–3; 6–7 depend on 4–5; 8 needs the user's
Tenderly environment; 9 closes the WO.

## Testing

- `test/tenderlyConfig.test.ts`: each missing var fails closed with a named error; http(s)
  enforced; redaction masks userinfo and path secrets; evidence objects never contain raw URLs.
- `test/tenderlyIsolation.test.ts`: no mainnet-scope file imports `src/tenderly/`;
  `createMainnetClient` still hard-asserts chain id 1; the admin adapter rejects a non-tenderly
  config shape and an endpoint whose `tenderly_getSyncStatus` probe fails.
- `test/forkEvidence.test.ts`: funding/approval/swap records are distinct sections; PASS only
  when `status == 1` and `actualOut >= amountOutMinimum`; override records carry slot/old/new.
- `bash scripts/check-no-send.sh` (strengthened), `npm run type-check`, `npm test`; CI unchanged.
- Manual (`.env`, user-provided Virtual Environment): `npm run fork` end-to-end; repeat
  `npm run fork:diagnostic -- --amount 5|10`.

## Out of scope (per WO)

No mainnet broadcast; no signing keys/seed phrases/real wallets in-repo; no weakening of the
mainnet no-send gate; no extreme slippage, alternate encodings, non-empty `hookData`,
multi-hop, or split routes; no bytecode deploys or modifications; fork results are never
presented as mainnet transactions; Phase 2 work does not start until this WO and WO-6 complete.

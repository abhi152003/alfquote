# The `alfquote` CLI

This is the Phase 2 product guide: installation, configuration, commands, the JSON
contract, exit codes, troubleshooting, and safety. Phase 1 evidence tooling is
documented separately in [the evidence section](#phase-1-evidence-commands) below.

## Installation

Requirements: Node.js >= 22.12 and npm. From a clean checkout:

```sh
npm ci
npm run build
node packages/cli/dist/main.js --help
```

Inside the workspace the binary is also available as `npx alfquote` (workspace link).
Configuration is a single environment variable or flag:

```sh
export ETHEREUM_RPC_URL="https://your-mainnet-rpc"   # http(s) or ws(s)
alfquote discover --chain 1
```

`--rpc <url>` overrides the environment for a single invocation. The URL is treated as
a secret: it is masked in configuration errors, redacted from every error and output
path, and never written to disk by the CLI.

## Commands

| Command | Purpose | Exit codes |
| --- | --- | --- |
| `alfquote discover` | Factory deployments (+ optional explicit fixtures), or a hook's pools via `--pools-for`/`--from-block`/`--to-block` | 0, 4, 6 |
| `alfquote assess` | Compatibility, provenance, routing, upgradeability — four independent evidence-backed fields, never a combined verdict | 0, 4, 6 |
| `alfquote quote` | Exact-input indicative quote through the hook (empty `hookData`, `maxGas`-bounded, non-binding) | 0, 2, 4, 6 |
| `alfquote swap` | Dry-run a protected Universal Router v2 swap: plan, calldata, simulation, allowance blockers | 0, 2, 4, 5, 6 |

Common options on every command: `--format human|json`, `--block <n>` (pin reads; archive
RPC required), `--chain <n>` (must be 1 in Phase 2), `--rpc <url>`, `--help`, `--version`.

### The journey

```sh
alfquote discover --chain 1 --format json
alfquote assess --hook 0x00000078BD49D5279a99b5F4011a5C61eE8caaC0 --use-fixture-pool
alfquote quote --use-fixture-pool --amount 1 --exact-in
alfquote swap --use-fixture-pool --amount 1 --slippage-bps 50 --sender <address> --dry-run
```

Pool context is either the pinned demo pool (`--use-fixture-pool`, an explicit fixture —
never labeled factory-attested) or a fully explicit key (`--hook` with
`--currency0/--currency1/--fee/--tick-spacing`). `quote --pool <id>` validates the
supplied id against the PoolId derived from the resolved key and rejects mismatches
before any RPC reads. `swap` supports the currency0 → currency1 direction only;
`quote` supports both via `--one-for-zero`. Amounts are whole tokens with
`--decimals <n>` (default 6).

## JSON contract (schema version 1)

Every command emits the same versioned envelope — valid for ok, skip, and error alike:

```jsonc
{
  "schemaVersion": 1,               // bump on breaking envelope changes
  "command": "quote",               // discover | assess | quote | swap
  "chain": { "chainId": 1, "blockNumber": "25930000", "blockSource": "pinned" },
  "input": { "poolId": "0xf323…b065", "amount": "1000000", "direction": "exact-in" },
  "warnings": [ { "code": "quote/non-binding", "message": "…" } ],
  "status": "ok",                   // ok | skip | error
  "data": { /* command payload */ }
  // skip: "skipped": { "code": "quote/zero-output", "message": "…" }
  // error: "error": { "code": "rpc/read-failed", "message": "…" }
}
```

Canonical encoding rules: `bigint` values are decimal strings; codes are namespaced
`domain/reason` strings; there is no ANSI formatting, no logs, and one final redaction
pass guarantees no RPC credential reaches stdout. Representative outputs:

- `discover` ok → `data.hooks[]`: `{ address, registryIndex, provenance: "factory"|"fixture"|"unknown", evidence: { isFromFactory, creationCodeHash, hookReportedFactory, reverseMatches }, block }` and `data.partialFailures[]`.
- `assess` ok → `data`: exactly `compatibility`, `provenance`, `routing`, `upgradeability`, each `{ status, evidence[] }`. There is no `safe` field by contract.
- `quote` ok → `data`: `amountInUnits`/`outputAmountUnits` (+ raw values), `inputToken`/`outputToken` metadata, `gasCap`, and `liquidity: { vanillaPoolManager, reserves, effectiveLiquidity }` — three distinct signals; size fills from `effectiveLiquidity`.
- `swap` ok → `data`: `plan` (exact `commands`/`actions`/`inputs`/`calldata`, `amountOutMinimum`, `slippageBps`, `deadline`), `stateBlockUsed`, `gas` or decoded `revert`, and `allowanceIssues[]` (blockers that must be fixed, never bypassed).

Human output renders the same underlying result with status, evidence, warnings,
blockers, and caveats as separate sections.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | ok |
| 1 | internal error (sanitized message on stderr) |
| 2 | typed skip (zero quote, dead liveness, stale pool) |
| 3 | invalid input (flags, addresses, amounts, PoolId mismatch) |
| 4 | unavailable evidence (error envelope, e.g. RPC failure) |
| 5 | dry-run swap blocked by balance/allowance |
| 6 | configuration error (missing/invalid RPC, wrong chain) |

## Troubleshooting

- **exit 6 `missing RPC endpoint`** — set `ETHEREUM_RPC_URL` or pass `--rpc`.
- **exit 4 with an archive error when using `--block`** — pinned reads need an
  archive-capable RPC.
- **exit 2 `quote/zero-output` / `pool/not-live`** — the pool was not live or quoting
  zero at that block; a skip is never a price. Try a recent `--block` or latest state.
- **exit 5 blockers** — the sender lacks balance, the ERC-20 → Permit2 allowance, or
  the Permit2 → router allowance. Fix the allowances; the CLI never bypasses them.
- **`--pools-for` range errors** — providers often cap `eth_getLogs` ranges (10 blocks
  on some free tiers); narrow `--from-block`/`--to-block`.

## Safety

- `swap` is dry-run only; `--send`/`--live`/`--broadcast` are rejected outright.
- No signing, wallet clients, private keys, or broadcasting exist anywhere in the CLI
  or the library (enforced by the no-send and package-boundary gates in CI).
- Assessment never emits a combined safety verdict; treat each dimension separately.
- Indicative quotes are non-binding and can diverge at larger sizes; the swap
  `amountOutMinimum` is always derived from the quote minus explicit slippage.

## Phase 1 evidence commands

Phase 1 verification and controlled-fork evidence tooling is preserved and separate
from the product CLI (see [docs/pins.md](pins.md) and
[docs/fork-evidence.json](fork-evidence.json)):

| Product command (read-only, latest or pinned) | Phase 1 evidence entry point |
| --- | --- |
| `alfquote discover/assess/quote/swap` | `npm run spike` / `proof` / `simulate` / `sweep` (`scripts/phase1/`) |
| — (controlled fork, non-product) | `npm run fork` (`scripts/tenderly/`; release evidence is single-shot per address) |

The opt-in mainnet integration suite for this journey is
`ALFQUOTE_INTEGRATION=1 bash scripts/integration-mainnet.sh` (read-only; asserts exit
codes 0/0/0/5 and JSON envelope validity for the four commands).

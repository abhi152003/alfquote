# ALFQuote

TypeScript library and CLI for discovering, assessing, and quoting Uniswap v4 DualPool hooks through `IALFHook` views.

DualPool keeps just-in-time inventory in ERC-4626 vaults. PoolManager can report little or no vanilla liquidity between swaps even when the hook can still quote. ALFQuote is the hook-aware integrator path. It does not deploy new hook bytecode.

## Status

This repository holds the build plan and the mainnet verification spike workspace. The library, CLI, and the `uniswap-ai` skill land in later phases.

See [docs/ALFQuote.md](docs/ALFQuote.md).

## Workspace

The spike workspace is a root TypeScript package using [viem](https://viem.sh) for Ethereum reads.

Requirements: Node.js >= 22.9 and npm. From a clean checkout:

```sh
npm install
cp .env.example .env   # ETHEREUM_RPC_URL; simulate needs ALFQUOTE_SIMULATION_FROM;
                       # the fork proof needs the TENDERLY_* variables (see .env.example)
```

`ETHEREUM_RPC_URL` must be an http(s) or ws(s) endpoint. `.env` is git-ignored; never commit RPC keys.

Shared flags for spike, proof, and simulate (env or argv): `ALFQUOTE_AMOUNT_USDC` / `--amount`, `ALFQUOTE_BLOCK` / `--block`. A pinned block needs an archive-capable RPC. Omit the block for latest-state.

| Command | Action |
| --- | --- |
| `npm run dev` | Run the mainnet spike in watch mode |
| `npm run type-check` | Type-check all TypeScript |
| `npm run build` | Compile to `dist/` |
| `npm test` | Run unit tests (Vitest) |
| `npm run spike` | Run the mainnet verification spike (`scripts/verify-mainnet.ts`) |
| `npm run proof` | Run the negative-liquidity proof (`scripts/prove-liquidity.ts`) |
| `npm run simulate` | Protected Universal Router dry-run; exits 0 only on success at 50 bps |
| `npm run simulate:diagnostic` | Diagnostic dry-run (non-default slippage allowed); never the release result |
| `npm run sweep` | Quote + simulate at 1, 5, 10, and 100 USDC |
| `npm run check-no-send` | Fail if mainnet-path files contain broadcast/signer/state-override APIs or reference Tenderly at all |
| `npm run fork` | Controlled-fork proof: verify the Tenderly fork, fund + approve a test address, execute the protected 1 USDC swap (exits 0 only on PASS) |
| `npm run fork:diagnostic` | Same path with non-default amount/slippage; never the release result |
| `npm run release` | Type-check, build, test, no-send, spike, proof, and the controlled-fork swap |

The spike fails closed: it exits non-zero with an actionable message when `ETHEREUM_RPC_URL` is missing or invalid.

CI runs `npm ci`, type-check, build, tests, and a no-send grep. It does not use an RPC secret. Live spike/proof/simulate stay on `npm run release` locally.

Verified mainnet facts are pinned in [docs/pins.md](docs/pins.md). Upstream permalinks and the PoolManager slot excerpt are in [docs/upstream/](docs/upstream/).

## Evidence labels

Two evidence types exist and are never mixed:

- **Ethereum mainnet, read-only.** `npm run spike`, `proof`, `simulate`, and `sweep` only read chain state (`eth_call`, `eth_getCode`, `eth_getStorageAt`) and never send transactions. CI enforces this with the no-send gate.
- **Controlled-fork execution.** `npm run fork` runs on a Tenderly Virtual Environment fork of Ethereum mainnet. It injects balances and approvals for a dedicated test address (Admin RPC cheatcodes + unsigned transactions), then executes the protected Universal Router swap. Results are recorded in [docs/fork-evidence.json](docs/fork-evidence.json) and are **not** Ethereum mainnet transactions. The Admin RPC URL is treated as a secret and is never logged or exported.

## License

[MIT](LICENSE)

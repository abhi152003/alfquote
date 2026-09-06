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
cp .env.example .env   # then set ETHEREUM_RPC_URL to a mainnet RPC endpoint
```

`ETHEREUM_RPC_URL` must be an http(s) or ws(s) endpoint. `.env` is git-ignored; never commit RPC keys.

| Command | Action |
| --- | --- |
| `npm run dev` | Run the mainnet spike in watch mode |
| `npm run type-check` | Type-check all TypeScript |
| `npm run build` | Compile to `dist/` |
| `npm test` | Run unit tests (Vitest) |
| `npm run spike` | Run the mainnet verification spike (`scripts/verify-mainnet.ts`) |

The spike fails closed: it exits non-zero with an actionable message when `ETHEREUM_RPC_URL` is missing or invalid.

## License

[MIT](LICENSE)

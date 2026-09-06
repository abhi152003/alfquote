# ALFQuote

TypeScript library and CLI for discovering, assessing, and quoting Uniswap v4 DualPool hooks through `IALFHook` views.

DualPool keeps just-in-time inventory in ERC-4626 vaults. PoolManager can report little or no vanilla liquidity between swaps even when the hook can still quote. ALFQuote is the hook-aware integrator path. It does not deploy new hook bytecode.

## Status

This repository currently holds the build plan. Library, CLI, and the `uniswap-ai` skill land in later phases.

See [docs/ALFQuote.md](docs/ALFQuote.md).

## License

[MIT](LICENSE)

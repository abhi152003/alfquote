# ABI pins

Read-only ABI JSON files pinned from the upstream sources live here. They are
added by the go/no-go spike (WO-2) and must record the exact source revision:

- `IALFHook.json` — quote surface (`isLive`, `maxGas`, `getIndicativeQuote`,
  `swapToPrice`, `livePools`, `getReserves`, `getEffectiveLiquidity`) from
  [v4-hooks-public](https://github.com/Uniswap/v4-hooks-public/blob/main/src/alf/interfaces/IALFHook.sol).
- `AllowlistedFactory.json` — `allDeployments`, `isFromFactory`, `Deployed`
  events from the same repository.
- `PoolManager.json` — the v4 core views needed for the vanilla-liquidity
  comparison.

ABIs only. This project never adds or modifies hook bytecode.

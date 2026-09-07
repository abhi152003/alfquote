# ABI pins

Read-only ABI JSON files pinned from upstream sources. Never bytecode.

All files were derived from `Uniswap/v4-hooks-public` at revision
`0f731d5de0f4fd60b506b55754d5e6ff086eab7d` (2026-08-19):

| File | Source |
| --- | --- |
| `IERC165.json` | OpenZeppelin `IERC165` (via the interfaces' imports) |
| `IHookStats.json` | `src/alf/interfaces/IHookStats.sol` |
| `IALFHook.json` | `src/alf/interfaces/IALFHook.sol` |
| `IAllowlistedFactory.json` | `src/interfaces/IAllowlistedFactory.sol` |
| `DualPoolHookViews.json` | `factory()` from `src/alf/DualPoolHook.sol`, `livePools(PoolId)` from `src/alf/base/OwnedALFHook.sol` |
| `IPoolManager.json` | Deployed `Initialize` event plus `extsload(bytes32)` from Uniswap v4 core `IPoolManager` / `StateLibrary` |
| `IERC20Metadata.json` | ERC-20 `decimals()` / `symbol()` (live unit labels; never assumed) |

Interface ids are computed from these ABIs at runtime (`src/interfaceId.ts`)
and verified on-chain through `supportsInterface` in the spike. The exact
evidence (block numbers, computed ids, reproduction commands) lives in
[docs/pins.md](../../docs/pins.md).

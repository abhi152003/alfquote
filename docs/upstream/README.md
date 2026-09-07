# Upstream source pins

| Constant | Source |
| --- | --- |
| `IALFHook` `0x7adbfbb8` | [IALFHook.sol](https://github.com/Uniswap/v4-hooks-public/blob/0f731d5de0f4fd60b506b55754d5e6ff086eab7d/src/alf/interfaces/IALFHook.sol) at `0f731d5de0f4fd60b506b55754d5e6ff086eab7d` |
| `IHookStats` `0x601b90d3` | [IHookStats.sol](https://github.com/Uniswap/v4-hooks-public/blob/0f731d5de0f4fd60b506b55754d5e6ff086eab7d/src/alf/interfaces/IHookStats.sol) at the same revision |
| `POOLS_SLOT = 6`, `LIQUIDITY_OFFSET = 3` | [StateLibrary.sol](https://github.com/Uniswap/v4-core/blob/46c6834698c48bc4a463a86d8420f4eb1d7f3b75/src/libraries/StateLibrary.sol) — excerpt in `StateLibrary.excerpt.sol` |

ERC-165 ids are XOR of each interface's own functions (`type(I).interfaceId`).

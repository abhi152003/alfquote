import type { Address, Hex } from "viem";

/** Documented Ethereum mainnet targets from docs/ALFQuote.md; the spike reverifies them live. */
export const ALLOWLISTED_FACTORY: Address = "0x0000000000077769C332e0D3ed8bC8E02A0cE108";

export const POOL_MANAGER: Address = "0x000000000004444c5dc75cB358380D2e3dE08A90";

/** Universal Router v2; swap encoding has no `minHopPriceX36`. */
export const UNIVERSAL_ROUTER: Address = "0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af";

export const PERMIT2: Address = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

/** Upstream revision the pinned ABIs were derived from. */
export const V4_HOOKS_PUBLIC_REVISION = "0f731d5de0f4fd60b506b55754d5e6ff086eab7d";

/** v4-core pin for `POOLS_SLOT` / `LIQUIDITY_OFFSET`. */
export const V4_CORE_REVISION = "46c6834698c48bc4a463a86d8420f4eb1d7f3b75";

export const IALFHOOK_INTERFACE_ID = "0x7adbfbb8" as Hex;
export const IHOOKSTATS_INTERFACE_ID = "0x601b90d3" as Hex;

export const UPSTREAM_SOURCE = `https://github.com/Uniswap/v4-hooks-public/tree/${V4_HOOKS_PUBLIC_REVISION}`;

export const IALFHOOK_SOURCE_URL =
  `https://github.com/Uniswap/v4-hooks-public/blob/${V4_HOOKS_PUBLIC_REVISION}/src/alf/interfaces/IALFHook.sol`;
export const IHOOKSTATS_SOURCE_URL =
  `https://github.com/Uniswap/v4-hooks-public/blob/${V4_HOOKS_PUBLIC_REVISION}/src/alf/interfaces/IHookStats.sol`;
export const V4_CORE_STATE_LIBRARY_URL =
  `https://github.com/Uniswap/v4-core/blob/${V4_CORE_REVISION}/src/libraries/StateLibrary.sol`;

// Verified mainnet facts, pinned 2026-09-07 (evidence and method in docs/pins.md).
// The one-off archive binary-search code that located the blocks was removed after
// verification; the fixture constants themselves live in ./phase1.ts.

/** Demo-pool currencies; PoolKey ordering is sorted, not ticker order. */
export const USDC: Address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
export const USDT: Address = "0xdAC17F958D2ee523a2206206994597C13D831ec7";


import type { Address, Hex } from "viem";
import type { PoolKey } from "./pool.js";

/** Documented Ethereum mainnet targets from docs/ALFQuote.md; the spike reverifies them live. */
export const ALLOWLISTED_FACTORY: Address = "0x0000000000077769C332e0D3ed8bC8E02A0cE108";

export const POOL_MANAGER: Address = "0x000000000004444c5dc75cB358380D2e3dE08A90";

/** Pre-factory example hook; always labeled `fixture`, never factory-attested. */
export const FIXTURE_HOOK: Address = "0x00000078BD49D5279a99b5F4011a5C61eE8caaC0";

/** Documented demo pool id for the fixture hook (USDC/USDT). */
export const FIXTURE_POOL_ID: Hex = "0xf32349cbc41fec9d3194f2b4e9ee72ded0bfda412427be9cb8a4087f74bdb065";

/** Upstream revision the pinned ABIs were derived from. */
export const V4_HOOKS_PUBLIC_REVISION = "0f731d5de0f4fd60b506b55754d5e6ff086eab7d";

export const UPSTREAM_SOURCE = `https://github.com/Uniswap/v4-hooks-public/tree/${V4_HOOKS_PUBLIC_REVISION}`;

// Verified mainnet facts, pinned 2026-09-07 (evidence and method in docs/pins.md).
// The one-off archive binary-search code that located the blocks was removed after
// verification; these constants are the evidence, not values the spike re-derives.

/** Demo-pool currencies; PoolKey ordering is sorted, not ticker order. */
export const USDC: Address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
export const USDT: Address = "0xdAC17F958D2ee523a2206206994597C13D831ec7";

/** Exact demo pool identity, decoded from the on-chain Initialize event. */
export const PINNED_POOL_KEY: PoolKey = {
  currency0: USDC,
  currency1: USDT,
  fee: 10,
  tickSpacing: 10,
  hooks: FIXTURE_HOOK,
};

export const DEMO_POOL_INIT = {
  block: 25_540_385n,
  tx: "0x6e4d659056af64eb5c5f3f045e1536cbb9f9955169f33369b13be8c724729d03" as Hex,
};

export const POOL_MANAGER_BIRTH_BLOCK = 21_688_329n;
export const FACTORY_BIRTH_BLOCK = 25_581_749n;
export const FIXTURE_HOOK_BIRTH_BLOCK = 25_525_327n;

/** The registry is append-only, so every pinned entry must remain present. */
export const FACTORY_REGISTRY_SNAPSHOT: Address[] = [
  "0x0000005bb4DF4109bF356a585C8b8Ea70FCbAaC0",
  "0x55BA643a0716988F2a7E7ff27Dc4c80BEa8a6ac0",
  "0x7b919ca67cbd31Ce752761e88Eb674acBFd22ac0",
  "0xCDE44B16E25B4321EF6471A4aa8D9D4D4Fbf2AC0",
  "0x000075e7511D6104d8b1e617A27d426d7611eac0",
];

import { describe, expect, it } from "vitest";
import { getAddress } from "viem";
import { derivePoolId, type PoolKey } from "../src/pool.js";
import {
  ALLOWLISTED_FACTORY,
  POOL_MANAGER,
  FIXTURE_HOOK,
  FIXTURE_POOL_ID,
  PINNED_POOL_KEY,
  V4_HOOKS_PUBLIC_REVISION,
} from "../src/addresses.js";

const syntheticKey: PoolKey = {
  currency0: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  currency1: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  fee: 10,
  tickSpacing: 1,
  hooks: "0x00000078BD49D5279a99b5F4011a5C61eE8caaC0",
};

describe("derivePoolId", () => {
  it("reproduces the on-chain pool id for the pinned demo PoolKey", () => {
    // The documented id was verified against the on-chain Initialize event
    // (docs/pins.md); the pinned key must keep deriving it.
    expect(derivePoolId(PINNED_POOL_KEY)).toBe(FIXTURE_POOL_ID);
  });

  it("matches the precomputed keccak256(abi.encode(key)) for the synthetic vector", () => {
    // Regression vector for the pure encoding path.
    expect(derivePoolId(syntheticKey)).toBe(
      "0x8dceac5f6f2650e0942d9e38b193c6e51c020af7ceffcfea8df46586ae7a36c4",
    );
  });

  it("is deterministic and 32 bytes", () => {
    const a = derivePoolId(syntheticKey);
    expect(a).toBe(derivePoolId({ ...syntheticKey }));
    expect(a).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("changes when any PoolKey component changes (hook is part of identity)", () => {
    const otherHook = derivePoolId({ ...syntheticKey, hooks: getAddress(`0x${"00".repeat(19)}01`) });
    expect(otherHook).not.toBe(derivePoolId(syntheticKey));
    const otherFee = derivePoolId({ ...syntheticKey, fee: 500 });
    expect(otherFee).not.toBe(derivePoolId(syntheticKey));
  });
});

describe("documented constants", () => {
  it("addresses pass EIP-55 checksum validation", () => {
    getAddress(ALLOWLISTED_FACTORY);
    getAddress(POOL_MANAGER);
    getAddress(FIXTURE_HOOK);
  });

  it("fixture pool id is a 32-byte value and the revision is a 40-hex commit", () => {
    expect(FIXTURE_POOL_ID).toMatch(/^0x[0-9a-f]{64}$/);
    expect(V4_HOOKS_PUBLIC_REVISION).toMatch(/^[0-9a-f]{40}$/);
  });
});

import { describe, expect, it } from "vitest";
import { poolStateSlot, decodeVanillaLiquidity } from "../src/pool.js";
import { FIXTURE_POOL_ID } from "../src/addresses.js";

describe("poolStateSlot", () => {
  it("matches the precomputed keccak256(abi.encode(poolId, 6)) vector", () => {
    // keccak256(abi.encode(poolId, uint256(6)))
    expect(poolStateSlot(FIXTURE_POOL_ID)).toBe(
      "0x33d45d331c8969f95aa10e26be8f4e03dde8dc8dc754fc95e7d1dc227d50a7d8",
    );
  });

  it("is deterministic and 32 bytes", () => {
    expect(poolStateSlot(FIXTURE_POOL_ID)).toBe(poolStateSlot(FIXTURE_POOL_ID));
    expect(poolStateSlot(FIXTURE_POOL_ID)).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

describe("decodeVanillaLiquidity", () => {
  it("extracts the low 128 bits, dropping the packed tickNext/initialized word", () => {
    // low 128 bits = 0xdeadbeef; high bits ignored
    const word = `0x${"07".padStart(32, "0")}${BigInt(0xdeadbeef).toString(16).padStart(32, "0")}` as `0x${string}`;
    expect(decodeVanillaLiquidity(word)).toBe(0xdeadbeefn);
  });

  it("returns 0 for an all-zero word", () => {
    expect(decodeVanillaLiquidity(`0x${"00".repeat(32)}`)).toBe(0n);
  });
});

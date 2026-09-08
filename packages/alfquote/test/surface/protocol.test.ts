/** Surface owner: pinned protocol data — ABIs, documented addresses, pool identity, reads. */
import { describe, expect, it } from "vitest";
import * as abis from "../../src/abis.js";
import * as addresses from "../../src/addresses.js";
import * as pool from "../../src/pool.js";
import * as poolState from "../../src/poolState.js";
import * as interfaceId from "../../src/interfaceId.js";
import * as erc20 from "../../src/erc20.js";
import * as allowances from "../../src/allowances.js";
import * as proofDecision from "../../src/proofDecision.js";

describe("surface: abis.js", () => {
  it("exports exactly the ten pinned ABIs", () => {
    expect(Object.keys(abis).sort()).toEqual([
      "alfHookAbi",
      "dualPoolHookViewsAbi",
      "erc165Abi",
      "erc20Abi",
      "erc20MetadataAbi",
      "factoryAbi",
      "hookStatsAbi",
      "permit2Abi",
      "poolManagerAbi",
      "universalRouterAbi",
    ]);
  });
});

describe("surface: addresses.js", () => {
  it("exports exactly the documented protocol constants and stays fixture-free", () => {
    expect(Object.keys(addresses).sort()).toEqual([
      "ALLOWLISTED_FACTORY",
      "IALFHOOK_INTERFACE_ID",
      "IALFHOOK_SOURCE_URL",
      "IHOOKSTATS_INTERFACE_ID",
      "IHOOKSTATS_SOURCE_URL",
      "PERMIT2",
      "POOL_MANAGER",
      "UNIVERSAL_ROUTER",
      "UPSTREAM_SOURCE",
      "USDC",
      "USDT",
      "V4_CORE_REVISION",
      "V4_CORE_STATE_LIBRARY_URL",
      "V4_HOOKS_PUBLIC_REVISION",
    ]);
    for (const name of Object.keys(addresses)) {
      expect(name).not.toMatch(/^FIXTURE|PINNED|BIRTH|SNAPSHOT/);
    }
  });
});

describe("surface: pool identity and state reads", () => {
  it("pool.js, poolState.js, interfaceId.js export exactly the pinned helpers", () => {
    expect(Object.keys(pool).sort()).toEqual([
      "LIQUIDITY_OFFSET",
      "POOLS_SLOT",
      "decodeVanillaLiquidity",
      "derivePoolId",
      "poolStateSlot",
    ]);
    expect(Object.keys(poolState).sort()).toEqual(["readVanillaLiquidity"]);
    expect(Object.keys(interfaceId).sort()).toEqual(["interfaceIdOf"]);
  });
});

describe("surface: token reads, allowances, and the proof decision", () => {
  it("erc20.js, allowances.js, proofDecision.js export exactly the pinned helpers", () => {
    expect(Object.keys(erc20).sort()).toEqual(["readErc20Info"]);
    expect(Object.keys(allowances).sort()).toEqual(["allowanceBlockers", "readSwapAllowances"]);
    expect(Object.keys(proofDecision).sort()).toEqual(["NEAR_ZERO_VANILLA_LIQUIDITY", "decideProof"]);
  });
});

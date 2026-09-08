import { describe, expect, it } from "vitest";
import type { Hex } from "viem";
import {
  FINGERPRINT_CONTRACTS,
  ForkVerificationError,
  assertDistinctEndpoints,
  assertPinnedPoolIdentity,
  verifyFork,
  type VerifyDeps,
} from "../src/tenderly/forkVerify.js";
import { FIXTURE_POOL_ID, PINNED_POOL_KEY, POOL_MANAGER } from "../src/addresses.js";
import { loadTenderlyConfig } from "../src/tenderly/config.js";
import type { TenderlyAdmin } from "../src/tenderly/adminClient.js";

const VALID: Record<string, string> = {
  TENDERLY_PUBLIC_RPC_URL: "https://virtual.mainnet.rpc.tenderly.co/pub-abc123",
  TENDERLY_ADMIN_RPC_URL: "https://virtual.mainnet.rpc.tenderly.co/adm-xyz789",
  TENDERLY_FORK_BLOCK: "25926196",
  TENDERLY_CHAIN_ID: "73571",
  ALFQUOTE_TENDERLY_FROM: "0x1234567890abcdef1234567890abcdef12345678",
};

const admin = { latestBlockInfo: { number: "0x18bb0e7" } } as unknown as TenderlyAdmin;

const CODE = "0x6080604052" as const;
const STATE_WORD = "0x00000000000000000000000000000000000000000000000000000000deadbeef";

function matchingDeps(overrides?: Partial<VerifyDeps>): VerifyDeps {
  return {
    forkChainId: async () => 73571,
    forkHead: async () => 25926196n,
    forkCode: async () => CODE,
    mainnetCode: async () => CODE,
    forkStorageAtOrigin: async () => STATE_WORD,
    mainnetStorage: async () => STATE_WORD,
    ...overrides,
  };
}

describe("assertDistinctEndpoints", () => {
  it("refuses mainnet archive reads served by the fork host", () => {
    const config = loadTenderlyConfig(VALID);
    expect(() =>
      assertDistinctEndpoints(config, "https://virtual.mainnet.rpc.tenderly.co/other"),
    ).toThrow(ForkVerificationError);
    expect(() => assertDistinctEndpoints(config, "https://eth-mainnet.g.alchemy.com/v2/k")).not.toThrow();
  });
});

describe("assertPinnedPoolIdentity", () => {
  it("offline derivation still matches the documented pool id", () => {
    expect(assertPinnedPoolIdentity(PINNED_POOL_KEY, FIXTURE_POOL_ID)).toBe(FIXTURE_POOL_ID);
  });
});

describe("verifyFork", () => {
  it("confirms origin by exact head match when all fingerprints agree", async () => {
    const config = loadTenderlyConfig(VALID);
    const result = await verifyFork(config, admin, matchingDeps());
    expect(result.originCheck).toBe("head-equals-origin");
    expect(result.bytecodeMatches).toHaveLength(FINGERPRINT_CONTRACTS.length);
    expect(result.bytecodeMatches.every((entry) => entry.match)).toBe(true);
    expect(result.poolStateMatch).toBe(true);
  });

  it("confirms origin by state at the origin block when the fork has mined blocks", async () => {
    const config = loadTenderlyConfig(VALID);
    const result = await verifyFork(config, admin, matchingDeps({ forkHead: async () => 25926206n }));
    expect(result.originCheck).toBe("state-fingerprint-at-origin-block");
  });

  it("fails closed on chain-id mismatch", async () => {
    const config = loadTenderlyConfig(VALID);
    await expect(verifyFork(config, admin, matchingDeps({ forkChainId: async () => 1 }))).rejects.toThrow(
      /chain id 1 != configured 73571/,
    );
  });

  it("fails closed naming mismatched bytecode and pool state", async () => {
    const config = loadTenderlyConfig(VALID);
    const deps = matchingDeps({
      forkCode: async (address) => (address === POOL_MANAGER ? "0x6001" : CODE),
      forkStorageAtOrigin: async () => `0x${"11".repeat(32)}` as Hex,
    });
    await expect(verifyFork(config, admin, deps)).rejects.toThrow(/bytecode mismatch: PoolManager/);
    await expect(
      verifyFork(
        config,
        admin,
        matchingDeps({ forkHead: async () => 25926100n }),
      ),
    ).rejects.toThrow(/below the configured origin block/);
  });
});

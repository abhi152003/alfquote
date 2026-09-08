import { describe, expect, it } from "vitest";
import type { Hex } from "viem";
import {
  FINGERPRINT_CONTRACTS,
  ForkVerificationError,
  assertDistinctEndpoints,
  assertPinnedPoolIdentity,
  verifyFork,
  type VerifyDeps,
} from "../forkVerify.js";
import { FIXTURE_POOL_ID, PINNED_POOL_KEY, POOL_MANAGER } from "alfquote";
import { loadTenderlyConfig } from "../config.js";
import type { TenderlyAdmin } from "../adminClient.js";

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
const BLOCK_HASH = `0x${"ab".repeat(32)}` as Hex;
const STATS = { reserves: [853335661n, 152976810n] as const, effectiveLiquidity: [853335661n, 152976810n] as const };

function matchingDeps(overrides?: Partial<VerifyDeps>): VerifyDeps {
  return {
    forkChainId: async () => 73571,
    forkHead: async () => 25926196n,
    forkCode: async () => CODE,
    mainnetCode: async () => CODE,
    forkStorageAtOrigin: async () => STATE_WORD,
    mainnetStorage: async () => STATE_WORD,
    forkBlockHash: async () => BLOCK_HASH,
    mainnetBlockHash: async () => `0x${"cd".repeat(32)}` as Hex,
    originStats: async () => ({ reserves: STATS.reserves, effectiveLiquidity: STATS.effectiveLiquidity }),
    ...overrides,
  };
}

describe("assertDistinctEndpoints", () => {
  it("refuses mainnet reads served by the fork host", () => {
    const config = loadTenderlyConfig(VALID);
    expect(() => assertDistinctEndpoints(config, "https://virtual.mainnet.rpc.tenderly.co/other")).toThrow(ForkVerificationError);
    expect(() => assertDistinctEndpoints(config, "https://eth-mainnet.g.alchemy.com/v2/k")).not.toThrow();
  });
});

describe("assertPinnedPoolIdentity", () => {
  it("matches the documented pool id", () => {
    expect(assertPinnedPoolIdentity(PINNED_POOL_KEY, FIXTURE_POOL_ID)).toBe(FIXTURE_POOL_ID);
  });
});

describe("verifyFork", () => {
  it("verifies origin by bytecode and pool storage words, recording both block hashes", async () => {
    const result = await verifyFork(loadTenderlyConfig(VALID), admin, matchingDeps());
    expect(result.originCheck).toBe("state-fingerprint-at-origin-block");
    // VEs re-seal blocks: the two hashes are recorded identifiers and are expected to differ.
    expect(result.forkOriginBlockHash).not.toBe(result.mainnetOriginBlockHash);
    expect(result.poolStateWordsMatch).toBe(true);
    expect(result.bytecodeMatches).toHaveLength(FINGERPRINT_CONTRACTS.length);
    expect(result.poolStateMatch).toBe(true);
  });

  it("fails closed when an origin block hash identifier is missing", async () => {
    await expect(
      verifyFork(loadTenderlyConfig(VALID), admin, matchingDeps({ forkBlockHash: async () => "0x" as Hex })),
    ).rejects.toThrow(/origin block hash missing/);
  });

  it("fails closed when any consecutive pool storage word differs at the origin block", async () => {
    await expect(
      verifyFork(
        loadTenderlyConfig(VALID),
        admin,
        matchingDeps({ forkStorageAtOrigin: async (_contract, slot) => (BigInt(slot) % 3n === 0n ? `0x${"11".repeat(32)}` as Hex : STATE_WORD) }),
      ),
    ).rejects.toThrow(/pool state words 0\.\.5 differ/);
  });

  it("records timestamp-derived DualPool views without requiring their equality", async () => {
    // Hook views depend on block timestamps, which VEs re-seal; only storage must match.
    const drift = { reserves: [1n, 1n], effectiveLiquidity: [1n, 1n] } as const;
    const result = await verifyFork(
      loadTenderlyConfig(VALID),
      admin,
      matchingDeps({ originStats: async (side) => (side === "fork" ? drift : { reserves: STATS.reserves, effectiveLiquidity: STATS.effectiveLiquidity }) }),
    );
    expect(result.poolStateWordsMatch).toBe(true);
  });

  it("fails closed on chain, bytecode, state, or head mismatch", async () => {
    const config = loadTenderlyConfig(VALID);
    await expect(verifyFork(config, admin, matchingDeps({ forkChainId: async () => 1 }))).rejects.toThrow(/chain id/);
    await expect(verifyFork(config, admin, matchingDeps({ forkCode: async (address) => address === POOL_MANAGER ? "0x6001" : CODE }))).rejects.toThrow(/bytecode mismatch/);
    await expect(verifyFork(config, admin, matchingDeps({ forkStorageAtOrigin: async () => `0x${"11".repeat(32)}` as Hex }))).rejects.toThrow(/pool state mismatch/);
    await expect(verifyFork(config, admin, matchingDeps({ forkHead: async () => 1n }))).rejects.toThrow(/below configured origin/);
  });
});

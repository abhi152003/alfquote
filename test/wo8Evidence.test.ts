import { describe, expect, it } from "vitest";
import type { Address, Hex } from "viem";
import type { ForkEvidence } from "../src/tenderly/evidence.js";
import { ForkEvidenceValidationError, validateReleaseEvidence } from "../src/tenderly/evidence.js";
import { redactRpcSecrets } from "../src/output.js";

const HASH = `0x${"ab".repeat(32)}` as Hex;
const TEST = "0x0000000000000000000000000000000000000001" as Address;
const POOL_MANAGER = "0x0000000000000000000000000000000000000002" as Address;
const TOKEN = "0x0000000000000000000000000000000000000003" as Address;
const PERMIT2 = "0x0000000000000000000000000000000000000004" as Address;
const ROUTER = "0x0000000000000000000000000000000000000005" as Address;

function validEvidence(): ForkEvidence {
  return {
    proofType: "controlled-fork-execution",
    disclaimer: "controlled fork",
    recordedAtUtc: "2026-09-08T00:00:00Z",
    forkBlock: 1n,
    forkChainId: 9991,
    forkHeadAtVerification: 1n,
    originCheck: "state-fingerprint-at-origin-block",
    forkOriginBlockHash: HASH,
    mainnetOriginBlockHash: `0x${"cd".repeat(32)}`,
    poolStateWordsMatch: true,
    publicEndpoint: "https://virtual.mainnet.rpc.tenderly.co/***",
    testAddress: TEST,
    poolId: HASH,
    verification: {
      bytecodeMatches: [{ name: "PoolManager", address: POOL_MANAGER, match: true }],
      poolStateMatch: true,
      poolIdOffline: HASH,
      originStats: {
        fork: { reserves: [1n, 2n], effectiveLiquidity: [1n, 2n] },
        mainnet: { reserves: [1n, 2n], effectiveLiquidity: [1n, 2n] },
      },
      adminProbeLatestBlock: {},
    },
    setup: {
      funding: [
        { kind: "fund-native", method: "tenderly_setBalance", address: TEST, amountWei: 1n, result: HASH },
        { kind: "fund-erc20", method: "tenderly_addErc20Balance", token: TOKEN, address: TEST, amount: 1n, result: HASH },
      ],
      approvals: [
        { kind: "approve-erc20-permit2", token: TOKEN, owner: TEST, spender: PERMIT2, amount: 1n, tx: HASH, status: "success", gasUsed: 1n, blockNumber: 2n, verificationRead: 1n },
        { kind: "approve-permit2-router", permit2: PERMIT2, token: TOKEN, owner: TEST, spender: ROUTER, amount: 1n, expiration: 999n, tx: HASH, status: "success", gasUsed: 1n, blockNumber: 3n, verificationRead: { amount: 1n, expiration: 999n } },
      ],
      storageOverrides: [],
    },
    swap: {
      amountIn: 1n,
      quotedOutput: 2n,
      slippageBps: 50n,
      amountOutMinimum: 1n,
      quoteBlock: 3n,
      deadline: 999n,
      txHash: HASH,
      receiptStatus: "success",
      receiptBlock: 4n,
      gasUsed: 1n,
      actualOut: 2n,
      transfersToUserFromLogs: 2n,
      usdcSpent: 1n,
      poolManagerSwapObserved: true,
      hookModifyLiquidityEvents: 2,
      commands: "0x10",
      actions: "0x060c0f",
      calldata: "0x1234",
      decodedEvents: [{ emitter: POOL_MANAGER, event: "Swap", topic0: HASH }],
      receiptLogs: [{ address: POOL_MANAGER, topics: [HASH], data: "0x" }],
      pass: true,
    },
    evidenceLink: "https://dashboard.tenderly.co/shared/simulation/example",
  };
}

describe("validateReleaseEvidence", () => {
  it("accepts one complete fresh-run evidence chain", () => {
    expect(() => validateReleaseEvidence(validEvidence())).not.toThrow();
  });

  it("rejects skipped setup, missing public evidence, and output mismatch", () => {
    const skipped = validEvidence();
    skipped.setup.funding = [{ kind: "fund-skipped", which: "native", reason: "pre-funded" }];
    expect(() => validateReleaseEvidence(skipped)).toThrow(ForkEvidenceValidationError);
    const noLink = validEvidence();
    delete noLink.evidenceLink;
    expect(() => validateReleaseEvidence(noLink)).toThrow(/evidence link/);
    const mismatch = validEvidence();
    mismatch.swap.transfersToUserFromLogs = 1n;
    expect(() => validateReleaseEvidence(mismatch)).toThrow(/output measurements/);
  });

  it("rejects missing origin identifiers and mismatched pool storage words", () => {
    const noHash = validEvidence();
    noHash.forkOriginBlockHash = "0x";
    expect(() => validateReleaseEvidence(noHash)).toThrow(/origin block hash identifiers/);
    const wordsOff = validEvidence();
    wordsOff.poolStateWordsMatch = false;
    expect(() => validateReleaseEvidence(wordsOff)).toThrow(/pool storage words/);
  });
});

describe("redactRpcSecrets", () => {
  it("removes Tenderly endpoint paths from arbitrary transport errors", () => {
    const url = "https://virtual.mainnet.eu.rpc.tenderly.co/rpc-admin/SecretKey123?token=abc";
    const result = redactRpcSecrets(`Request failed at ${url}`, [url]);
    expect(result).not.toContain("SecretKey123");
    expect(result).not.toContain("token=abc");
    expect(result).toContain("tenderly.co/***");
  });
});

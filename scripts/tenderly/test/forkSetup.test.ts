import { describe, expect, it } from "vitest";
import type { Address, Hex } from "viem";
import { PERMIT2, USDC } from "alfquote";
import {
  ForkSetupError,
  MIN_FUND_USDC,
  applyStorageOverride,
  planUsdcFunding,
  runForkSetup,
  type ForkReader,
  type ForkReceipt,
} from "../forkSetup.js";
import type { TenderlyAdmin } from "../adminClient.js";
import { loadTenderlyConfig } from "../config.js";

const VALID: Record<string, string> = {
  TENDERLY_PUBLIC_RPC_URL: "https://virtual.mainnet.rpc.tenderly.co/pub-abc123",
  TENDERLY_ADMIN_RPC_URL: "https://virtual.mainnet.rpc.tenderly.co/adm-xyz789",
  TENDERLY_FORK_BLOCK: "25926196",
  TENDERLY_CHAIN_ID: "73571",
  ALFQUOTE_TENDERLY_FROM: "0x1234567890abcdef1234567890abcdef12345678",
};

const FROM = "0x1234567890AbCdEf1234567890aBcDeF12345678" as Address;

function receipt(hash: `0x${string}`): ForkReceipt {
  return { hash, status: "success", gasUsed: 50_000n, blockNumber: 9n, logs: [] };
}

interface AdminScript {
  admin: TenderlyAdmin;
  sent: Array<{ to: Address; data: Hex }>;
  cheatcodes: string[];
}

/** Admin that records unsigned sends and returns sequential hashes. */
function scriptedAdmin(): AdminScript {
  const sent: Array<{ to: Address; data: Hex }> = [];
  const cheatcodes: string[] = [];
  let counter = 0;
  const nextHash = () => `0x${(counter++).toString(16).padStart(64, "0")}` as Hex;
  const admin: TenderlyAdmin = {
    config: loadTenderlyConfig(VALID),
    latestBlockInfo: {},
    async setBalance() {
      cheatcodes.push("tenderly_setBalance");
      return nextHash();
    },
    async addErc20Balance() {
      cheatcodes.push("tenderly_addErc20Balance");
      return nextHash();
    },
    async setStorageAt() {
      cheatcodes.push("tenderly_setStorageAt");
      return nextHash();
    },
    async sendUnsignedTransaction(tx) {
      sent.push({ to: tx.to, data: tx.data });
      return nextHash();
    },
  };
  return { admin, sent, cheatcodes };
}

interface ReaderState {
  native: bigint;
  usdc: bigint;
  erc20Allowance: bigint;
  permit2: { amount: bigint; expiration: bigint };
  storage: Record<string, Hex>;
}

function scriptedReader(state: ReaderState): ForkReader {
  let counter = 100;
  let receiptsSeen = 0;
  const nextHash = () => `0x${(counter++).toString(16).padStart(64, "0")}` as Hex;
  return {
    erc20Balance: async (token) => (token === USDC ? state.usdc : 0n),
    nativeBalance: async () => state.native,
    erc20Allowance: async () => state.erc20Allowance,
    permit2Allowance: async () => state.permit2,
    storageAt: async (contract, slot) => (state.storage[`${contract}:${slot}`] ?? (`0x${"0".repeat(64)}` as Hex)),
    waitForReceipt: async (hash) => {
      receiptsSeen += 1;
      // Mirror the two approval transactions: each receipt makes its allowance visible.
      if (receiptsSeen === 1) state.erc20Allowance = 2n ** 100n;
      if (receiptsSeen === 2) state.permit2 = { amount: 2n ** 100n, expiration: 2n ** 40n };
      return receipt(hash ?? nextHash());
    },
  };
}

describe("planUsdcFunding", () => {
  it("funds at least 100 USDC and four times the tested size", () => {
    expect(planUsdcFunding(1_000_000n)).toBe(MIN_FUND_USDC);
    expect(planUsdcFunding(100_000_000n)).toBe(400_000_000n);
  });
});

describe("runForkSetup", () => {
  it("funds and approves a fresh address with distinct record kinds", async () => {
    const { admin, sent, cheatcodes } = scriptedAdmin();
    const reader = scriptedReader({
      native: 0n,
      usdc: 0n,
      erc20Allowance: 0n,
      permit2: { amount: 0n, expiration: 0n },
      storage: {},
    });
    const config = { ...loadTenderlyConfig(VALID), from: FROM };
    const records = await runForkSetup(admin, reader, { config, amountIn: 1_000_000n, now: 1_700_000_000n });

    expect(cheatcodes).toEqual(["tenderly_setBalance", "tenderly_addErc20Balance"]);
    expect(records.funding.map((record) => record.kind)).toEqual(["fund-native", "fund-erc20"]);
    expect(records.approvals.map((record) => record.kind)).toEqual(["approve-erc20-permit2", "approve-permit2-router"]);
    expect(sent.map((tx) => tx.to)).toEqual([USDC, PERMIT2]);
    expect(records.overrides).toEqual([]);
  });

  it("records skips and performs no writes when prerequisites already hold", async () => {
    const { admin, sent, cheatcodes } = scriptedAdmin();
    const reader = scriptedReader({
      native: 5n * 10n ** 18n,
      usdc: 1_000_000_000n,
      erc20Allowance: 2n ** 100n,
      permit2: { amount: 2n ** 100n, expiration: 2n ** 40n },
      storage: {},
    });
    const config = { ...loadTenderlyConfig(VALID), from: FROM };
    const records = await runForkSetup(admin, reader, { config, amountIn: 1_000_000n, now: 1_700_000_000n });

    expect(cheatcodes).toEqual([]);
    expect(sent).toEqual([]);
    expect(records.funding.map((record) => record.kind)).toEqual(["fund-skipped", "fund-skipped"]);
    expect(records.funding.every((record) => record.kind === "fund-skipped")).toBe(true);
    expect(records.approvals.every((record) => record.kind === "approve-skipped")).toBe(true);
  });

  it("fails closed when an approval transaction reverts on the Virtual Environment", async () => {
    const { admin } = scriptedAdmin();
    const reader: ForkReader = {
      erc20Balance: async () => 1_000_000_000n,
      nativeBalance: async () => 5n * 10n ** 18n,
      erc20Allowance: async () => 0n,
      permit2Allowance: async () => ({ amount: 0n, expiration: 0n }),
      storageAt: async () => `0x${"0".repeat(64)}` as Hex,
      waitForReceipt: async (hash) => ({ ...receipt(hash), status: "reverted" }),
    };
    const config = { ...loadTenderlyConfig(VALID), from: FROM };
    await expect(runForkSetup(admin, reader, { config, amountIn: 1_000_000n, now: 1n })).rejects.toThrow(
      ForkSetupError,
    );
  });
});

describe("applyStorageOverride", () => {
  it("records contract, slot, old value, new value, and verification read", async () => {
    const { admin, cheatcodes } = scriptedAdmin();
    const slot = `0x${"ab".repeat(32)}` as Hex;
    const value = `0x${"cd".repeat(32)}` as Hex;
    const reader = scriptedReader({
      native: 0n,
      usdc: 0n,
      erc20Allowance: 0n,
      permit2: { amount: 0n, expiration: 0n },
      storage: {},
    });
    // First read returns the old value; post-write reads return the new value.
    let reads = 0;
    reader.storageAt = async () => ((reads++ === 0 ? `0x${"0".repeat(64)}` : value) as Hex);

    const record = await applyStorageOverride(admin, reader, {
      contract: `0x${"e".repeat(40)}` as Address,
      slot,
      value,
      reason: "normal approve blocked in test",
    });
    expect(cheatcodes).toEqual(["tenderly_setStorageAt"]);
    expect(record.kind).toBe("storage-override");
    expect(record.oldValue).toBe(`0x${"0".repeat(64)}`);
    expect(record.verificationRead).toBe(value);
  });
});

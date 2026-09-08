import { describe, expect, it } from "vitest";
import type { Address, Hex } from "viem";
import { USDC, USDT } from "alfquote";
import { FIXTURE_HOOK, PINNED_POOL_KEY } from "alfquote/phase1";
import { MODIFY_LIQUIDITY_SELECTOR, POOL_MANAGER_SWAP_SELECTORS, TRANSFER_EVENT_SELECTOR, decodeSwapEvents, executeDeadline, runForkSwap } from "../forkSwap.js";
import { assertNoEndpointSecrets } from "../evidence.js";
import type { ForkReceipt, ForkReader } from "../forkSetup.js";
import type { TenderlyAdmin } from "../adminClient.js";
import { loadTenderlyConfig } from "../config.js";

const VALID: Record<string, string> = { TENDERLY_PUBLIC_RPC_URL: "https://virtual.mainnet.rpc.tenderly.co/pub-abc123", TENDERLY_ADMIN_RPC_URL: "https://virtual.mainnet.rpc.tenderly.co/adm-xyz789", TENDERLY_FORK_BLOCK: "25926196", TENDERLY_CHAIN_ID: "73571", ALFQUOTE_TENDERLY_FROM: "0x1234567890abcdef1234567890abcdef12345678" };
const FROM = "0x1234567890AbCdEf1234567890aBcDeF12345678" as Address;
const ZERO = `0x${"0".repeat(64)}` as Hex;
function topicAddress(address: Address): Hex { return `0x${"0".repeat(24)}${address.slice(2).toLowerCase()}` as Hex; }
function dataWord(value: bigint): Hex { return `0x${value.toString(16).padStart(64, "0")}` as Hex; }

describe("decodeSwapEvents", () => {
  it("counts output transfers, swaps, and hook liquidity events", () => {
    const poolId = `0x${"f3".repeat(32)}` as Hex;
    const logs = [
      { address: USDT, topics: [TRANSFER_EVENT_SELECTOR, topicAddress(PINNED_POOL_KEY.currency1), topicAddress(FROM)], data: dataWord(1_000n) },
      { address: PINNED_POOL_KEY.hooks, topics: [POOL_MANAGER_SWAP_SELECTORS[0] as Hex, poolId, topicAddress(FROM)], data: ZERO },
      { address: FIXTURE_HOOK, topics: [MODIFY_LIQUIDITY_SELECTOR, poolId, topicAddress(FIXTURE_HOOK)], data: ZERO },
    ];
    const decoded = decodeSwapEvents(logs, { outputToken: USDT, user: FROM, hook: FIXTURE_HOOK });
    expect(decoded.transfersToUser).toBe(1_000n);
    expect(decoded.poolManagerSwapObserved).toBe(true);
    expect(decoded.hookModifyLiquidityEvents).toBe(1);
  });
});

function swapDeps(over: { usdtAfter?: bigint; transferValue?: bigint; quote?: bigint; status?: "success" | "reverted" } = {}) {
  const state = { usdt: 0n, usdc: 2_000_000n };
  const admin: TenderlyAdmin = { config: loadTenderlyConfig(VALID), latestBlockInfo: {}, async setBalance(){ throw new Error("not expected"); }, async addErc20Balance(){ throw new Error("not expected"); }, async setStorageAt(){ throw new Error("not expected"); }, async sendUnsignedTransaction(){ return `0x${"ee".repeat(32)}` as Hex; } };
  const poolId = `0x${"f3".repeat(32)}` as Hex;
  const reader: ForkReader = {
    erc20Balance: async (token) => token === USDT ? state.usdt : state.usdc,
    nativeBalance: async () => 10n ** 18n,
    erc20Allowance: async () => 2n ** 100n,
    permit2Allowance: async () => ({ amount: 2n ** 100n, expiration: 2n ** 40n }),
    storageAt: async () => ZERO,
    waitForReceipt: async (hash) => {
      state.usdt = over.usdtAfter ?? 1_000n;
      state.usdc -= 1_000n;
      const transferValue = over.transferValue ?? state.usdt;
      return { hash, status: over.status ?? "success", gasUsed: 400_000n, blockNumber: 42n, logs: [
        { address: USDT, topics: [TRANSFER_EVENT_SELECTOR, topicAddress(PINNED_POOL_KEY.currency1), topicAddress(FROM)], data: dataWord(transferValue) },
        { address: PINNED_POOL_KEY.hooks, topics: [POOL_MANAGER_SWAP_SELECTORS[0] as Hex, poolId, topicAddress(FROM)], data: ZERO },
        { address: FIXTURE_HOOK, topics: [MODIFY_LIQUIDITY_SELECTOR, poolId, topicAddress(FIXTURE_HOOK)], data: ZERO },
      ] };
    },
  };
  return { admin, deps: { ...reader, indicativeQuote: async () => ({ outputAmount: over.quote ?? 1_000n, hookDataEncoding: "empty" as const }), blockTimestamp: async () => 1_788_800_000n } };
}

describe("runForkSwap", () => {
  const config = { ...loadTenderlyConfig(VALID), from: FROM };
  it("passes only when output, input, swap, and hook evidence reconcile", async () => {
    const { admin, deps } = swapDeps();
    const run = await runForkSwap(admin, deps, { config, amountIn: 1_000n, quoteBlock: 1n });
    expect(run.pass).toBe(true);
  });
  it("fails below min-out", async () => {
    const { admin, deps } = swapDeps({ quote: 1_010n, usdtAfter: 1_000n });
    const run = await runForkSwap(admin, deps, { config, amountIn: 1_000n, quoteBlock: 1n });
    expect(run.pass).toBe(false);
    expect(run.failure).toMatch(/below amountOutMinimum/);
  });
  it("fails when log-summed output differs from the balance delta", async () => {
    const { admin, deps } = swapDeps({ usdtAfter: 1_000n, transferValue: 999n });
    const run = await runForkSwap(admin, deps, { config, amountIn: 1_000n, quoteBlock: 1n });
    expect(run.pass).toBe(false);
    expect(run.failure).toMatch(/output reconciliation/);
  });
  it("fails when the transaction reverts", async () => {
    const { admin, deps } = swapDeps({ status: "reverted", usdtAfter: 0n, transferValue: 0n });
    const run = await runForkSwap(admin, deps, { config, amountIn: 1_000n, quoteBlock: 1n });
    expect(run.pass).toBe(false);
  });
});

describe("executeDeadline", () => {
  it("uses wall clock when the latest fork timestamp is stale", () => {
    expect(executeDeadline(1_788_867_220n, 1_788_868_951n)).toBe(1_788_869_551n);
    expect(executeDeadline(1_788_868_981n, 1_788_868_951n)).toBe(1_788_869_581n);
  });
});

describe("assertNoEndpointSecrets", () => {
  it("fails closed on raw URLs and endpoint paths", () => {
    const config = loadTenderlyConfig(VALID);
    expect(() => assertNoEndpointSecrets(`https://virtual.mainnet.rpc.tenderly.co/adm-xyz789`, config)).toThrow();
    expect(() => assertNoEndpointSecrets(`/pub-abc123`, config)).toThrow();
    expect(() => assertNoEndpointSecrets(`https://dashboard.tenderly.co/shared/simulation/example`, config)).not.toThrow();
  });
});

describe("evidencePath", () => {
  it("routes release, failure, and diagnostic artifacts separately", async () => {
    const { evidencePath } = await import("../fork-execute.js");
    expect(evidencePath(false, true)).toMatch(/fork-evidence\.json$/);
    expect(evidencePath(false, false)).toMatch(/fork-evidence-failed\.json$/);
    expect(evidencePath(true, true)).toMatch(/fork-evidence-diagnostic\.json$/);
  });
  it("committed release artifact records a passing receipt", async () => {
    const raw = await import("node:fs").then((fs) => fs.readFileSync("docs/fork-evidence.json", "utf8"));
    const evidence = JSON.parse(raw) as { swap: { receiptBlock?: string; pass?: boolean } };
    expect(evidence.swap.receiptBlock).toMatch(/^[0-9]+$/);
    expect(evidence.swap.pass).toBe(true);
  });
});

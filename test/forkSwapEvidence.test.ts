import { describe, expect, it } from "vitest";
import type { Address, Hex } from "viem";
import { FIXTURE_HOOK, PINNED_POOL_KEY, USDC, USDT } from "../src/addresses.js";
import {
  MODIFY_LIQUIDITY_SELECTOR,
  POOL_MANAGER_SWAP_SELECTORS,
  TRANSFER_EVENT_SELECTOR,
  decodeSwapEvents,
  runForkSwap,
} from "../src/tenderly/forkSwap.js";
import { assertNoEndpointSecrets, buildForkEvidence, CONTROLLED_FORK_DISCLAIMER } from "../src/tenderly/evidence.js";
import type { ForkReceipt, ForkReader } from "../src/tenderly/forkSetup.js";
import type { TenderlyAdmin } from "../src/tenderly/adminClient.js";
import { loadTenderlyConfig } from "../src/tenderly/config.js";
import type { ForkVerification } from "../src/tenderly/forkVerify.js";

const VALID: Record<string, string> = {
  TENDERLY_PUBLIC_RPC_URL: "https://virtual.mainnet.rpc.tenderly.co/pub-abc123",
  TENDERLY_ADMIN_RPC_URL: "https://virtual.mainnet.rpc.tenderly.co/adm-xyz789",
  TENDERLY_FORK_BLOCK: "25926196",
  TENDERLY_CHAIN_ID: "73571",
  ALFQUOTE_TENDERLY_FROM: "0x1234567890abcdef1234567890abcdef12345678",
};

const FROM = "0x1234567890AbCdEf1234567890aBcDeF12345678" as Address;
const ZERO = `0x${"0".repeat(64)}` as Hex;

function topicAddress(address: Address): Hex {
  return `0x${"0".repeat(24)}${address.slice(2).toLowerCase()}` as Hex;
}

function dataWord(value: bigint): Hex {
  return `0x${value.toString(16).padStart(64, "0")}` as Hex;
}

describe("decodeSwapEvents", () => {
  it("counts output-token transfers to the user and hook liquidity events", () => {
    // PoolManager Swap/ModifyLiquidity index (id, sender): sender is topics[2].
    const poolIdTopic = `0x${"f3".repeat(32)}` as Hex;
    const logs = [
      { address: USDT, topics: [TRANSFER_EVENT_SELECTOR, topicAddress(PINNED_POOL_KEY.currency1), topicAddress(FROM)], data: dataWord(1_000n) },
      { address: USDT, topics: [TRANSFER_EVENT_SELECTOR, topicAddress(FROM), topicAddress(PINNED_POOL_KEY.currency1)], data: dataWord(999n) },
      { address: USDC, topics: [TRANSFER_EVENT_SELECTOR, topicAddress(FROM), topicAddress(FIXTURE_HOOK)], data: dataWord(1n) },
      { address: FIXTURE_HOOK, topics: [MODIFY_LIQUIDITY_SELECTOR, poolIdTopic, topicAddress(FIXTURE_HOOK)], data: ZERO },
      { address: PINNED_POOL_KEY.hooks, topics: [POOL_MANAGER_SWAP_SELECTORS[0] as Hex, poolIdTopic, topicAddress(FROM)], data: ZERO },
      { address: PINNED_POOL_KEY.hooks, topics: [MODIFY_LIQUIDITY_SELECTOR, poolIdTopic, topicAddress(FROM)], data: ZERO },
    ];
    const decoded = decodeSwapEvents(logs, { outputToken: USDT, user: FROM, hook: FIXTURE_HOOK });
    expect(decoded.transfersToUser).toBe(1_000n);
    expect(decoded.hookModifyLiquidityEvents).toBe(1);
    expect(decoded.poolManagerSwapObserved).toBe(true);
    expect(decoded.events.filter((event) => event.event === "Transfer")).toHaveLength(3);
    expect(decoded.events.filter((event) => event.event === "ModifyLiquidity")).toHaveLength(2);
  });
});

function swapDeps(over?: { usdtBefore?: bigint; usdtAfter?: bigint; quote?: bigint; status?: "success" | "reverted"; logs?: ForkReceipt["logs"] }) {
  const state = {
    usdt: over?.usdtBefore ?? 0n,
    usdc: 2_000_000n,
  };
  const admin: TenderlyAdmin = {
    config: loadTenderlyConfig(VALID),
    latestBlockInfo: {},
    async setBalance() {
      throw new Error("not expected");
    },
    async addErc20Balance() {
      throw new Error("not expected");
    },
    async setStorageAt() {
      throw new Error("not expected");
    },
    async sendUnsignedTransaction() {
      return `0x${"ee".repeat(32)}` as Hex;
    },
  };
  const reader: ForkReader = {
    erc20Balance: async (token) => (token === PINNED_POOL_KEY.currency1 ? state.usdt : state.usdc),
    nativeBalance: async () => 10n ** 18n,
    erc20Allowance: async () => 2n ** 100n,
    permit2Allowance: async () => ({ amount: 2n ** 100n, expiration: 2n ** 40n }),
    storageAt: async () => ZERO,
    waitForReceipt: async (hash) => {
      state.usdt = over?.usdtAfter ?? 1_000n;
      return {
        hash,
        status: over?.status ?? "success",
        gasUsed: 400_000n,
        blockNumber: 42n,
        logs: over?.logs ?? [
          { address: USDT, topics: [TRANSFER_EVENT_SELECTOR, topicAddress(PINNED_POOL_KEY.currency1), topicAddress(FROM)], data: dataWord(1_000n) },
          { address: FIXTURE_HOOK, topics: [MODIFY_LIQUIDITY_SELECTOR, `0x${"f3".repeat(32)}` as Hex, topicAddress(FIXTURE_HOOK)], data: ZERO },
        ],
      };
    },
  };
  return {
    admin,
    deps: {
      ...reader,
      maxGas: async () => 800_000n,
      indicativeQuote: async () => ({
        outputAmount: over?.quote ?? 1_010n,
        hookDataEncoding: "empty" as const,
      }),
      blockTimestamp: async () => 1_788_800_000n,
    },
  };
}

describe("runForkSwap", () => {
  const config = { ...loadTenderlyConfig(VALID), from: FROM };

  it("fails when actual output falls below the 50 bps bound", async () => {
    const { admin, deps } = swapDeps({ quote: 1_010n, usdtAfter: 1_000n });
    const run = await runForkSwap(admin, deps, { config, amountIn: 1_000n, quoteBlock: 25926196n });
    // quote 1010 at 50 bps -> minOut 1004; delivered 1000 -> min-out protection fires
    expect(run.amountOutMinimum).toBe(1_004n);
    expect(run.actualOut).toBe(1_000n);
    expect(run.pass).toBe(false);
    expect(run.failure).toMatch(/below amountOutMinimum/);
  });

  it("passes when actual output is at or above amountOutMinimum", async () => {
    const { admin, deps } = swapDeps({ quote: 1_000n, usdtAfter: 1_000n });
    const run = await runForkSwap(admin, deps, { config, amountIn: 1_000n, quoteBlock: 25926196n });
    expect(run.amountOutMinimum).toBe(995n);
    expect(run.actualOut).toBe(1_000n);
    expect(run.pass).toBe(true);
    expect(run.hookModifyLiquidityEvents).toBe(1);
    expect(run.transfersToUserFromLogs).toBe(1_000n);
  });

  it("fails with a decoded reason when the transaction reverts", async () => {
    const { admin, deps } = swapDeps({ status: "reverted", usdtAfter: 0n });
    const run = await runForkSwap(admin, deps, { config, amountIn: 1_000n, quoteBlock: 25926196n });
    expect(run.pass).toBe(false);
    expect(run.failure).toMatch(/reverted/);
  });
});

describe("evidence", () => {
  const verification: ForkVerification = {
    chainId: 73571,
    forkHead: 25926196n,
    originBlock: 25926196n,
    originCheck: "head-equals-origin",
    bytecodeMatches: [{ name: "PoolManager", address: "0x000000000004444c5dc75cB358380D2e3dE08A90", match: true }],
    poolStateSlot: `0x${"ab".repeat(32)}` as Hex,
    poolStateWordFork: `0x${"11".repeat(32)}` as Hex,
    poolStateWordMainnet: `0x${"11".repeat(32)}` as Hex,
    poolStateMatch: true,
    poolIdOffline: `0x${"22".repeat(32)}` as Hex,
    latestBlockInfo: { number: "0x18bb0e7" },
  };

  function evidenceFixture() {
    const { admin, deps } = swapDeps({ quote: 1_000n, usdtAfter: 1_000n });
    return {
      config: loadTenderlyConfig(VALID),
      verification,
      setup: {
        config: loadTenderlyConfig(VALID),
        funding: [
          { kind: "fund-native" as const, method: "tenderly_setBalance" as const, address: FROM, amountWei: 10n ** 18n, result: `0x${"1".repeat(64)}` as Hex },
        ],
        approvals: [
          { kind: "approve-skipped" as const, which: "erc20-permit2" as const, reason: "existing allowance" },
        ],
        overrides: [],
      },
      swap: undefined as unknown as Awaited<ReturnType<typeof runForkSwap>>,
      admin,
      deps,
    };
  }

  it("separates funding, approvals, and the swap; never contains endpoint URLs", async () => {
    const fixture = evidenceFixture();
    const config = { ...fixture.config, from: FROM };
    const swap = await runForkSwap(fixture.admin, fixture.deps, { config, amountIn: 1_000n, quoteBlock: 25926196n });
    const evidence = buildForkEvidence({
      config,
      verification,
      setup: fixture.setup,
      swap,
      poolId: "0x" + "22".repeat(32),
    });
    const serialized = JSON.stringify(evidence, (_, value) => (typeof value === "bigint" ? value.toString() : value));

    expect(evidence.proofType).toBe("controlled-fork-execution");
    expect(evidence.disclaimer).toBe(CONTROLLED_FORK_DISCLAIMER);
    expect(evidence.setup.funding).toHaveLength(1);
    expect(evidence.setup.approvals).toHaveLength(1);
    expect(evidence.swap.pass).toBe(true);
    expect(serialized).not.toContain("tenderly.co/pub-");
    expect(serialized).not.toContain("tenderly.co/adm-");
    expect(() => assertNoEndpointSecrets(serialized, fixture.config)).not.toThrow();
  });

  it("assertNoEndpointSecrets fails closed on any raw or path-leaked endpoint", () => {
    const config = loadTenderlyConfig(VALID);
    expect(() => assertNoEndpointSecrets(`{"url": "https://virtual.mainnet.rpc.tenderly.co/adm-xyz789"}`, config)).toThrow();
    expect(() => assertNoEndpointSecrets(`{"path": "/pub-abc123"}`, config)).toThrow();
    expect(() => assertNoEndpointSecrets(`{"x": 1}`, config)).not.toThrow();
  });
});

describe("executeDeadline", () => {
  it("uses the wall clock when the latest-block timestamp is stale (idle VE gap)", async () => {
    const { executeDeadline } = await import("../src/tenderly/forkSwap.js");
    const wall = 1_788_868_951n;
    expect(executeDeadline(1_788_867_220n, wall)).toBe(wall + 600n);
    expect(executeDeadline(wall + 30n, wall)).toBe(wall + 630n);
  });
});

describe("evidencePath routing", () => {
  it("commits only a non-diagnostic PASS to the release artifact", async () => {
    const { evidencePath } = await import("../scripts/fork-execute.js");
    expect(evidencePath(false, true)).toMatch(/docs\/fork-evidence\.json$/);
    expect(evidencePath(true, true)).toMatch(/docs\/fork-evidence-diagnostic\.json$/);
    expect(evidencePath(false, false)).toMatch(/docs\/fork-evidence-failed\.json$/);
    expect(evidencePath(true, false)).toMatch(/docs\/fork-evidence-diagnostic\.json$/);
  });

  it("the release evidence serializes the swap receipt block", async () => {
    const raw = await import("node:fs").then((fs) => fs.readFileSync("docs/fork-evidence.json", "utf8"));
    const evidence = JSON.parse(raw) as { swap: { receiptBlock?: string; pass?: boolean } };
    expect(evidence.swap.receiptBlock).toMatch(/^[0-9]+$/);
    expect(evidence.swap.pass).toBe(true);
  });
});

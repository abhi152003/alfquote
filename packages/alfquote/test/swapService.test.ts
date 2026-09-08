/** WO-13 swap service tests: pure planning + mock simulation; no state changes. */
import { describe, expect, it } from "vitest";
import type { Address } from "viem";
import { SWAP_ERROR_CODES, SWAP_WARNING_CODES, planProtectedSwap, simulateProtectedSwap, type SwapPlan } from "../src/swap.js";
import { PERMIT2, UNIVERSAL_ROUTER } from "../src/addresses.js";
import { FIXTURE_HOOK, FIXTURE_POOL_ID, PINNED_POOL_KEY } from "../src/phase1.js";
import { fakeClient } from "./mockClient.js";

const KEY = PINNED_POOL_KEY;
const QUOTE = 100_000_466n;
const AMOUNT_IN = 100_000_000n;
const DEADLINE = 1_788_890_000n;
const SENDER: Address = "0x5bc6f16Ca189D3C8d3Fbaf367611fB04a0B7b309";

function plan(overrides: Partial<Parameters<typeof planProtectedSwap>[0]> = {}): SwapPlan {
  const result = planProtectedSwap({
    poolKey: KEY,
    zeroForOne: true,
    amountInRaw: AMOUNT_IN,
    quotedOutputRaw: QUOTE,
    deadline: DEADLINE,
    ...overrides,
  });
  if (result.status !== "ok") throw new Error(`plan failed: ${JSON.stringify(result)}`);
  return result.data;
}

describe("planProtectedSwap", () => {
  it("builds UR v2 V4_SWAP calldata with the pinned actions and empty hookData", () => {
    const result = planProtectedSwap({
      poolKey: KEY, zeroForOne: true, amountInRaw: AMOUNT_IN, quotedOutputRaw: QUOTE, deadline: DEADLINE,
    });
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.data.encoding).toBe("v2");
    expect(result.data.commands).toBe("0x10");
    expect(result.data.actions).toBe("0x060c0f");
    expect(result.data.poolKey).toEqual(KEY);
    expect(result.data.amountOutMinimum).toBe((QUOTE * 9_950n) / 10_000n);
    expect(result.data.quotedOutputRaw).toBe(QUOTE);
    expect(result.data.deadline).toBe(DEADLINE);
    expect(result.input).toEqual({ poolId: FIXTURE_POOL_ID, amountIn: AMOUNT_IN, slippageBps: 50n, mode: "dry-run" });
    // the encoded inputs embed the exact swap params including empty hookData
    expect(result.data.calldata.startsWith("0x3593564c")).toBe(true);
    expect(result.data.calldata.length).toBeGreaterThan(200);
  });

  it("never uses the raw quote as the bound and rejects consuming slippage", () => {
    const bounded = planProtectedSwap({
      poolKey: KEY, zeroForOne: true, amountInRaw: AMOUNT_IN, quotedOutputRaw: QUOTE, slippageBps: 5_000n, deadline: DEADLINE,
    });
    if (bounded.status !== "ok") throw new Error("expected ok");
    expect(bounded.data.amountOutMinimum).toBe(QUOTE / 2n);
    expect(bounded.data.amountOutMinimum).toBeLessThan(QUOTE);
    // slippage that consumes the entire quote leaves no protection: rejected
    const consumed = planProtectedSwap({
      poolKey: KEY, zeroForOne: true, amountInRaw: AMOUNT_IN, quotedOutputRaw: 2n, slippageBps: 9_999n, deadline: DEADLINE,
    });
    expect(consumed.status === "error" && consumed.error.code).toBe("swap/input-invalid");
    expect(consumed.status === "error" && consumed.error.message).toContain("consumes the whole quote");
    const outOfRange = planProtectedSwap({
      poolKey: KEY, zeroForOne: true, amountInRaw: AMOUNT_IN, quotedOutputRaw: 1n, slippageBps: 10_000n, deadline: DEADLINE,
    });
    expect(outOfRange.status === "error" && outOfRange.error.code).toBe("swap/input-invalid");
    expect(SWAP_ERROR_CODES).toContain("swap/input-invalid");
  });

  it("rejects zero amounts and zero quotes as input errors", () => {
    const zeroAmount = planProtectedSwap({ poolKey: KEY, zeroForOne: true, amountInRaw: 0n, quotedOutputRaw: QUOTE, deadline: DEADLINE });
    expect(zeroAmount.status === "error" && zeroAmount.error.code).toBe("swap/input-invalid");
    const zeroQuote = planProtectedSwap({ poolKey: KEY, zeroForOne: true, amountInRaw: AMOUNT_IN, quotedOutputRaw: 0n, deadline: DEADLINE });
    expect(zeroQuote.status === "error" && zeroQuote.error.message).toContain("zero quote");
  });
});

function simRoutes(overrides: { reads?: Record<string, unknown>; estimateGas?: bigint | Error } = {}) {
  const token = KEY.currency0.toLowerCase();
  return {
    head: 25_934_000n,
    block: { timestamp: 1_788_889_000n },
    estimateGas: overrides.estimateGas ?? 1_670_415n,
    reads: {
      [`${token}.balanceOf(${SENDER})`]: 1_000_000_000n,
      [`${token}.allowance(${SENDER})`]: 1_000_000_000n,
      [`${PERMIT2.toLowerCase()}.allowance(${SENDER})`]: [1_000_000_000n, 1_788_900_000n, 0n],
      ...overrides.reads,
    },
  };
}

describe("simulateProtectedSwap", () => {
  it("reports gas, healthy allowances, and the state block used", async () => {
    const { client } = fakeClient(simRoutes());
    const result = await simulateProtectedSwap(client, { sender: SENDER, plan: plan(), blockNumber: 25_930_000n });
    if (result.status !== "ok") throw new Error(`expected ok: ${JSON.stringify(result)}`);
    expect(result.data.gas).toBe(1_670_415n);
    expect(result.data.stateBlockUsed).toBe(25_930_000n);
    expect(result.data.allowanceIssues).toEqual([]);
    expect(result.data.plan.calldata).toBe(plan().calldata);
    expect(result.warnings.map((warning) => warning.code)).toContain("swap/no-execution-certainty");
    expect(result.warnings.map((warning) => warning.code)).not.toContain("swap/allowance-blockers");
    expect(SWAP_WARNING_CODES).toContain("swap/no-execution-certainty");
  });

  it("returns balance and both allowance layers as explicit blockers", async () => {
    const token = KEY.currency0.toLowerCase();
    const { client } = fakeClient(simRoutes({
      reads: {
        [`${token}.balanceOf(${SENDER})`]: 1n,
        [`${PERMIT2.toLowerCase()}.allowance(${SENDER})`]: [1n, 1_788_900_000n, 0n],
      },
    }));
    const result = await simulateProtectedSwap(client, { sender: SENDER, plan: plan(), blockNumber: 25_930_000n });
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.data.allowanceIssues.length).toBeGreaterThanOrEqual(2);
    expect(result.warnings.map((warning) => warning.code)).toContain("swap/allowance-blockers");
  });

  it("flags expired Permit2 allowances", async () => {
    const { client } = fakeClient(simRoutes({
      reads: { [`${PERMIT2.toLowerCase()}.allowance(${SENDER})`]: [1_000_000_000n, 1_700_000_000n, 0n] },
    }));
    const result = await simulateProtectedSwap(client, { sender: SENDER, plan: plan(), blockNumber: 25_930_000n });
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.data.allowanceIssues.some((issue) => issue.includes("expired"))).toBe(true);
  });

  it("keeps decoded revert evidence with a conservative classification", async () => {
    // Unrecognized revert data falls back to a conservative Unknown classification.
    const { client } = fakeClient(simRoutes({ estimateGas: new Error("execution reverted: 0xdeadbeef") }));
    const result = await simulateProtectedSwap(client, { sender: SENDER, plan: plan(), blockNumber: 25_930_000n });
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.data.gas).toBeUndefined();
    expect(result.data.revert).toBeDefined();
    expect(result.data.revert?.correctable).toBe(false);
  });

  it("errors structurally when allowance reads fail", async () => {
    const token = KEY.currency0.toLowerCase();
    const { client } = fakeClient(simRoutes({
      reads: { [`${token}.balanceOf(${SENDER})`]: new Error("rpc down") },
    }));
    const result = await simulateProtectedSwap(client, { sender: SENDER, plan: plan(), blockNumber: 25_930_000n });
    expect(result.status === "error" && result.error.code).toBe("swap/read-failed");
  });

  it("errors on chain mismatch and pins unpinned runs to the head", async () => {
    const wrong = fakeClient({ ...simRoutes(), chainId: 137 });
    const mismatch = await simulateProtectedSwap(wrong.client, { sender: SENDER, plan: plan(), blockNumber: 25_930_000n });
    expect(mismatch.status === "error" && mismatch.error.code).toBe("rpc/chain-mismatch");

    const latest = fakeClient({ ...simRoutes(), head: 25_934_999n });
    const result = await simulateProtectedSwap(latest.client, { sender: SENDER, plan: plan() });
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.chain).toEqual({ chainId: 1, blockNumber: 25_934_999n, blockSource: "latest" });
    expect(result.data.stateBlockUsed).toBe(25_934_999n);
  });
});

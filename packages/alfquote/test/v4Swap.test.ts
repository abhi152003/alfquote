import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { decodeFunctionData } from "viem";
import type { Hex } from "viem";
import { universalRouterAbi } from "../src/abis.js";
import { USDC, USDT } from "../src/addresses.js";
import { PINNED_POOL_KEY } from "../src/phase1.js";
import {
  DEFAULT_SLIPPAGE_BPS,
  SWAP_EXACT_IN_SINGLE,
  SETTLE_ALL,
  TAKE_ALL,
  V4_SWAP_COMMAND,
  amountOutMinimumFromQuote,
  decodeV4ExactInSingleCalldata,
  encodeV4ExactInSingleExecute,
  quoteFillGapBps,
} from "../src/v4Swap.js";

/** Independently ABI-encoded execute vector (not from encodeV4ExactInSingleExecute). */
const GOLDEN_EXECUTE_CALLDATA = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "fixtures/golden-ur-v2-execute.hex"),
  "utf8",
).trim() as Hex;

describe("amountOutMinimumFromQuote", () => {
  it("applies 50 bps without using the raw quote as the bound", () => {
    const quote = 99_996_353n;
    const min = amountOutMinimumFromQuote(quote, DEFAULT_SLIPPAGE_BPS);
    expect(min).toBe((quote * 9950n) / 10_000n);
    expect(min).toBeLessThan(quote);
    expect(min).toBeGreaterThan(0n);
  });
});

describe("encodeV4ExactInSingleExecute", () => {
  const encoded = encodeV4ExactInSingleExecute({
    poolKey: PINNED_POOL_KEY,
    zeroForOne: true,
    amountIn: 100_000_000n,
    amountOutMinimum: 99_000_000n,
    hookData: "0x",
  });

  it("uses V4_SWAP command 0x10", () => {
    expect(encoded.commands).toBe(`0x${V4_SWAP_COMMAND.toString(16).padStart(2, "0")}`);
  });

  it("uses SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL", () => {
    expect(encoded.actions).toBe(
      `0x${[SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL].map((n) => n.toString(16).padStart(2, "0")).join("")}`,
    );
  });

  it("keeps DualPool hookData empty in the v2 struct", () => {
    expect(encoded.encoding).toBe("v2");
    expect(encoded.inputs.length).toBe(1);
    expect(encoded.calldata.startsWith("0x")).toBe(true);
    const decoded = decodeFunctionData({ abi: universalRouterAbi, data: encoded.calldata });
    expect(decoded.functionName).toBe("execute");
    expect(decoded.args[0]).toBe(encoded.commands);
  });

  it("pins the fixture pool currencies on the swap", () => {
    expect(PINNED_POOL_KEY.currency0).toBe(USDC);
    expect(PINNED_POOL_KEY.currency1).toBe(USDT);
  });

  it("decodes nested V4_SWAP input fields", () => {
    const inner = decodeV4ExactInSingleCalldata(encoded.calldata);
    expect(inner.commands).toBe("0x10");
    expect(inner.actions).toBe("0x060c0f");
    expect(inner.poolKey).toEqual(PINNED_POOL_KEY);
    expect(inner.zeroForOne).toBe(true);
    expect(inner.amountIn).toBe(100_000_000n);
    expect(inner.amountOutMinimum).toBe(99_000_000n);
    expect(inner.hookData).toBe("0x");
    expect(inner.settle).toEqual({ currency: USDC, amount: 100_000_000n });
    expect(inner.take).toEqual({ currency: USDT, amount: 99_000_000n });
  });
});

describe("golden Universal Router calldata", () => {
  const encoded = encodeV4ExactInSingleExecute(
    {
      poolKey: PINNED_POOL_KEY,
      zeroForOne: true,
      amountIn: 1_000_000n,
      amountOutMinimum: 995_000n,
      hookData: "0x",
    },
    "v2",
    1n,
  );

  it("matches the independently sourced literal vector", () => {
    expect(encoded.calldata).toBe(GOLDEN_EXECUTE_CALLDATA);
  });

  it("decodes nested PoolKey, direction, amounts, empty hookData, settle, and take", () => {
    const inner = decodeV4ExactInSingleCalldata(GOLDEN_EXECUTE_CALLDATA);
    expect(inner.commands).toBe("0x10");
    expect(inner.actions).toBe("0x060c0f");
    expect(inner.deadline).toBe(1n);
    expect(inner.poolKey).toEqual(PINNED_POOL_KEY);
    expect(inner.zeroForOne).toBe(true);
    expect(inner.amountIn).toBe(1_000_000n);
    expect(inner.amountOutMinimum).toBe(995_000n);
    expect(inner.hookData).toBe("0x");
    expect(inner.settle).toEqual({ currency: USDC, amount: 1_000_000n });
    expect(inner.take).toEqual({ currency: USDT, amount: 995_000n });
  });
});

describe("quoteFillGapBps", () => {
  it("reports the shortfall in basis points", () => {
    expect(quoteFillGapBps(100n, 73n)).toBe(2700n);
    expect(quoteFillGapBps(100n, 100n)).toBe(0n);
  });
});

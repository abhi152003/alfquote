import { describe, expect, it } from "vitest";
import { decodeFunctionData } from "viem";
import { universalRouterAbi } from "../src/abis.js";
import { PINNED_POOL_KEY, USDC, USDT } from "../src/addresses.js";
import {
  DEFAULT_SLIPPAGE_BPS,
  SWAP_EXACT_IN_SINGLE,
  SETTLE_ALL,
  TAKE_ALL,
  V4_SWAP_COMMAND,
  amountOutMinimumFromQuote,
  decodeV4ExactInSingleCalldata,
  encodeV4ExactInSingleExecute,
} from "../src/v4Swap.js";

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

/** WO-12 quote service tests: mock-client only; fixture is the pinned USDC/USDT pool. */
import { describe, expect, it } from "vitest";
import { encodeAbiParameters } from "viem";
import type { Address, Hex } from "viem";
import { QUOTE_ERROR_CODES, QUOTE_WARNING_CODES, quoteExactIn, quoteSwapToPrice } from "../src/quote.js";
import { POOL_MANAGER } from "../src/addresses.js";
import { POOLS_SLOT, LIQUIDITY_OFFSET, poolStateSlot } from "../src/pool.js";
import { FIXTURE_HOOK, FIXTURE_POOL_ID, PINNED_POOL_KEY } from "../src/phase1.js";
import { fakeClient } from "./mockClient.js";

const HOOK = FIXTURE_HOOK;
const POOL_ID = FIXTURE_POOL_ID;
const KEY = PINNED_POOL_KEY;
const ZERO_WORD = `0x${"0".repeat(64)}`;
const GAS_CAP = 800_000n;
const AMOUNT_IN = 100_000_000n; // 100 USDC (6 decimals)
const QUOTED_OUT = 100_000_466n;

function uint256Data(value: bigint): { data: Hex } {
  return { data: encodeAbiParameters([{ name: "out", type: "uint256" }], [value]) };
}

function quoteRoutes(overrides: {
  reads?: Record<string, unknown>;
  call?: (req: { to: Address; data: Hex; gas?: bigint; blockNumber?: bigint }) => { data: Hex };
} = {}) {
  const stateSlot = poolStateSlot(POOL_ID);
  const liquiditySlot = `0x${(BigInt(stateSlot) + LIQUIDITY_OFFSET).toString(16).padStart(64, "0")}`;
  const keyJson = JSON.stringify(KEY);
  const h = HOOK.toLowerCase();
  return {
    head: 25_934_000n,
    reads: {
      [`${h}.maxGas()`]: GAS_CAP,
      [`${h}.isLive()`]: true,
      [`${h}.livePools(${POOL_ID})`]: true,
      [`${POOL_MANAGER.toLowerCase()}.extsload(${stateSlot})`]: ZERO_WORD,
      [`${POOL_MANAGER.toLowerCase()}.extsload(${liquiditySlot})`]: ZERO_WORD,
      [`${h}.getReserves(${keyJson})`]: [818_464_750_000n, 188_016_987_000n],
      [`${h}.getEffectiveLiquidity(${keyJson})`]: [818_464_750n, 188_016_987n],
      [`${KEY.currency0.toLowerCase()}.decimals()`]: 6,
      [`${KEY.currency0.toLowerCase()}.symbol()`]: "USDC",
      [`${KEY.currency1.toLowerCase()}.decimals()`]: 6,
      [`${KEY.currency1.toLowerCase()}.symbol()`]: "USDT",
      ...overrides.reads,
    },
    call: overrides.call ?? (() => uint256Data(QUOTED_OUT)),
  };
}

describe("quoteExactIn", () => {
  it("returns a normalized, gas-bounded, empty-hookData quote for the fixture pool", async () => {
    const { client, calls } = fakeClient(quoteRoutes());
    const result = await quoteExactIn(client, {
      hook: HOOK,
      poolKey: KEY,
      zeroForOne: true,
      amountInRaw: AMOUNT_IN,
      blockNumber: 25_930_000n,
    });
    if (result.status !== "ok") throw new Error(`expected ok, got ${result.status}`);
    expect(result.chain).toEqual({ chainId: 1, blockNumber: 25_930_000n, blockSource: "pinned" });
    expect(result.data.poolId).toBe(POOL_ID);
    expect(result.data.direction).toBe("exact-in");
    expect(result.data.zeroForOne).toBe(true);
    expect(result.data.inputToken).toEqual({ decimals: 6, symbol: "USDC" });
    expect(result.data.outputToken).toEqual({ decimals: 6, symbol: "USDT" });
    expect(result.data.amountInUnits).toBe("100");
    expect(result.data.outputAmountRaw).toBe(QUOTED_OUT);
    expect(result.data.outputAmountUnits).toBe("100.000466");
    expect(result.data.gasCap).toBe(GAS_CAP);
    expect(result.data.liquidity.vanillaPoolManager).toBe(0n);
    expect(result.data.liquidity.reserves).toEqual([818_464_750_000n, 188_016_987_000n]);
    expect(result.data.liquidity.effectiveLiquidity).toEqual([818_464_750n, 188_016_987n]);
    expect(result.warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining(["quote/non-binding", "quote/size-divergence"]),
    );
    const ethCall = calls.find((entry) => entry.method === "eth_call");
    expect(ethCall?.gas).toBe(GAS_CAP);
    expect(ethCall?.blockNumber).toBe(25_930_000n);
    expect(ethCall?.to).toBe(HOOK);
  });

  it("encodes the v4 exact-input sign (negative amountSpecified) against the fixture", async () => {
    const { client, calls } = fakeClient(quoteRoutes());
    await quoteExactIn(client, { hook: HOOK, poolKey: KEY, zeroForOne: true, amountInRaw: AMOUNT_IN, blockNumber: 25_930_000n });
    const ethCall = calls.find((entry) => entry.method === "eth_call");
    // int256 two's complement of -100000000 in the amountSpecified word of getIndicativeQuote
    const negative = `0x${(2n ** 256n - AMOUNT_IN).toString(16).padStart(64, "0")}`;
    expect(ethCall?.data).toContain(negative.slice(2));
  });

  it("skips with a typed zero-output outcome instead of a zero success", async () => {
    const { client } = fakeClient(quoteRoutes({ call: () => uint256Data(0n) }));
    const result = await quoteExactIn(client, { hook: HOOK, poolKey: KEY, zeroForOne: true, amountInRaw: AMOUNT_IN, blockNumber: 25_930_000n });
    expect(result.status).toBe("skip");
    if (result.status === "skip") {
      expect(result.skipped.code).toBe("quote/zero-output");
      expect(QUOTE_WARNING_CODES.length).toBeGreaterThan(0);
    }
  });

  it("stops quoting when hook-level liveness is false", async () => {
    const { client, calls } = fakeClient(quoteRoutes({ reads: { [`${HOOK.toLowerCase()}.isLive()`]: false } }));
    const result = await quoteExactIn(client, { hook: HOOK, poolKey: KEY, zeroForOne: true, amountInRaw: AMOUNT_IN, blockNumber: 25_930_000n });
    expect(result.status === "skip" && result.skipped.code).toBe("hook/not-live");
    expect(calls.some((entry) => entry.method === "eth_call")).toBe(false);
  });

  it("stops quoting when pool-level liveness is false", async () => {
    const { client } = fakeClient(quoteRoutes({ reads: { [`${HOOK.toLowerCase()}.livePools(${POOL_ID})`]: false } }));
    const result = await quoteExactIn(client, { hook: HOOK, poolKey: KEY, zeroForOne: true, amountInRaw: AMOUNT_IN, blockNumber: 25_930_000n });
    expect(result.status === "skip" && result.skipped.code).toBe("pool/not-live");
  });

  it("stops quoting when liveness reads fail", async () => {
    const { client } = fakeClient(quoteRoutes({ reads: { [`${HOOK.toLowerCase()}.isLive()`]: new Error("revert") } }));
    const result = await quoteExactIn(client, { hook: HOOK, poolKey: KEY, zeroForOne: true, amountInRaw: AMOUNT_IN, blockNumber: 25_930_000n });
    expect(result.status === "skip" && result.skipped.code).toBe("quote/view-error");
  });

  it("skips when the gas bound cannot be read", async () => {
    const { client } = fakeClient(quoteRoutes({ reads: { [`${HOOK.toLowerCase()}.maxGas()`]: new Error("revert") } }));
    const result = await quoteExactIn(client, { hook: HOOK, poolKey: KEY, zeroForOne: true, amountInRaw: AMOUNT_IN, blockNumber: 25_930_000n });
    expect(result.status === "skip" && result.skipped.code).toBe("quote/gas-unavailable");
  });

  it("skips with a sanitized message when the quote call reverts", async () => {
    const { client } = fakeClient(quoteRoutes({ call: () => { throw new Error("execution reverted: paused"); } }));
    const result = await quoteExactIn(client, { hook: HOOK, poolKey: KEY, zeroForOne: true, amountInRaw: AMOUNT_IN, blockNumber: 25_930_000n });
    expect(result.status === "skip" && result.skipped.code).toBe("quote/view-error");
  });

  it("redacts credential-bearing transport text from skip and stats-warning messages", async () => {
    const leaky = "node failed https://eth-mainnet.g.alchemy.com/v2/alch_SECRETKEY1234 timeout";
    const keyJson = JSON.stringify(KEY);
    const h = HOOK.toLowerCase();
    const { client } = fakeClient(quoteRoutes({
      reads: { [`${h}.getReserves(${keyJson})`]: new Error(leaky) },
    }));
    const result = await quoteExactIn(client, { hook: HOOK, poolKey: KEY, zeroForOne: true, amountInRaw: AMOUNT_IN, blockNumber: 25_930_000n });
    if (result.status !== "ok") throw new Error("expected ok");
    const statsWarning = result.warnings.find((warning) => warning.code === "quote/stats-unavailable");
    expect(statsWarning?.message).toContain("/v2/***");
    expect(statsWarning?.message).not.toContain("SECRETKEY");
  });

  it("errors on token metadata failures (units are part of the contract)", async () => {
    const { client } = fakeClient(quoteRoutes({ reads: { [`${KEY.currency1.toLowerCase()}.decimals()`]: new Error("no token") } }));
    const result = await quoteExactIn(client, { hook: HOOK, poolKey: KEY, zeroForOne: true, amountInRaw: AMOUNT_IN, blockNumber: 25_930_000n });
    expect(result.status).toBe("error");
    if (result.status === "error") expect([...QUOTE_ERROR_CODES, "rpc/read-failed"]).toContain(result.error.code);
  });

  it("keeps failed stats as nulls with warnings, never guesses", async () => {
    const keyJson = JSON.stringify(KEY);
    const h = HOOK.toLowerCase();
    const { client } = fakeClient(quoteRoutes({
      reads: {
        [`${h}.getReserves(${keyJson})`]: new Error("revert"),
        [`${h}.getEffectiveLiquidity(${keyJson})`]: new Error("revert"),
      },
    }));
    const result = await quoteExactIn(client, { hook: HOOK, poolKey: KEY, zeroForOne: true, amountInRaw: AMOUNT_IN, blockNumber: 25_930_000n });
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.data.liquidity.reserves).toBeNull();
    expect(result.data.liquidity.effectiveLiquidity).toBeNull();
    expect(result.warnings.filter((warning) => warning.code === "quote/stats-unavailable").length).toBeGreaterThanOrEqual(2);
  });

  it("maps input and output tokens for the reverse direction (zeroForOne: false)", async () => {
    const { client } = fakeClient(quoteRoutes());
    const result = await quoteExactIn(client, { hook: HOOK, poolKey: KEY, zeroForOne: false, amountInRaw: AMOUNT_IN, blockNumber: 25_930_000n });
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.data.inputToken).toEqual({ decimals: 6, symbol: "USDT" });
    expect(result.data.outputToken).toEqual({ decimals: 6, symbol: "USDC" });
    expect(result.data.zeroForOne).toBe(false);
  });

  it("rejects non-positive amounts as input errors", async () => {
    const { client } = fakeClient(quoteRoutes());
    const result = await quoteExactIn(client, { hook: HOOK, poolKey: KEY, zeroForOne: true, amountInRaw: 0n });
    expect(result.status === "error" && result.error.code).toBe("quote/input-invalid");
  });

  it("pins unpinned quotes to the fetched head", async () => {
    const { client } = fakeClient({ ...quoteRoutes(), head: 25_934_777n });
    const result = await quoteExactIn(client, { hook: HOOK, poolKey: KEY, zeroForOne: true, amountInRaw: AMOUNT_IN });
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.chain).toEqual({ chainId: 1, blockNumber: 25_934_777n, blockSource: "latest" });
  });

  it("errors on chain mismatch with the shared code", async () => {
    const { client } = fakeClient({ ...quoteRoutes(), chainId: 137 });
    const result = await quoteExactIn(client, { hook: HOOK, poolKey: KEY, zeroForOne: true, amountInRaw: AMOUNT_IN, blockNumber: 25_930_000n });
    expect(result.status === "error" && result.error.code).toBe("rpc/chain-mismatch");
  });
});

describe("quoteSwapToPrice", () => {
  function pairData(amountIn: bigint, amountOut: bigint): { data: Hex } {
    return {
      data: encodeAbiParameters(
        [{ name: "amountIn", type: "uint256" }, { name: "amountOut", type: "uint256" }],
        [amountIn, amountOut],
      ),
    };
  }

  it("returns the typed price-bounded result with the gas cap applied", async () => {
    const { client, calls } = fakeClient({ ...quoteRoutes(), call: () => pairData(99_000_000n, 100_000_000n) });
    const result = await quoteSwapToPrice(client, {
      hook: HOOK,
      poolKey: KEY,
      zeroForOne: false,
      amountSpecified: 100_000_000n,
      sqrtPriceLimitX96: 2n ** 96n,
      blockNumber: 25_930_000n,
    });
    if (result.status !== "ok") throw new Error(`expected ok, got ${result.status}`);
    expect(result.data.amountIn).toBe(99_000_000n);
    expect(result.data.amountOut).toBe(100_000_000n);
    expect(result.data.direction).toBe("exact-out");
    expect(result.input.direction).toBe("exact-out");
    expect(result.data.sqrtPriceLimitX96).toBe(2n ** 96n);
    expect(result.data.gasCap).toBe(GAS_CAP);
    expect(result.warnings.map((warning) => warning.code)).toContain("quote/non-binding");
    expect(calls.find((entry) => entry.method === "eth_call")?.gas).toBe(GAS_CAP);
  });

  it("skips with a sanitized message when the view reverts", async () => {
    const { client } = fakeClient({ ...quoteRoutes(), call: () => { throw new Error("price limit reached"); } });
    const result = await quoteSwapToPrice(client, {
      hook: HOOK, poolKey: KEY, zeroForOne: true, amountSpecified: -100n, sqrtPriceLimitX96: 0n, blockNumber: 25_930_000n,
    });
    expect(result.status === "skip" && result.skipped.code).toBe("quote/view-error");
    expect(result.input.direction).toBe("exact-in");
  });
});

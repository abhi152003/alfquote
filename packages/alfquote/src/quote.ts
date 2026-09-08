/** Public quote view types (service implementation lands with the quote work order). */

import type { Hex } from "viem";
import type { PoolId } from "./pool.js";

/** Swap direction requested by the caller. */
export type QuoteDirection = "exact-in" | "exact-out";

export interface QuoteInput {
  readonly poolId: PoolId;
  readonly amount: bigint;
  readonly direction: QuoteDirection;
}

/**
 * Hook-aware indicative quote. `amountSpecified` follows the v4 convention:
 * negative for exact input, positive for exact output.
 */
export interface IndicativeQuoteView {
  readonly poolId: PoolId;
  readonly zeroForOne: boolean;
  readonly amountSpecified: bigint;
  readonly outputAmount: bigint;
  /** Encoding the hook accepted: DualPool Phase 2 requires `empty`. */
  readonly hookDataEncoding: "empty" | "encoded-ALFHookData" | "none";
  readonly quoteBlock: bigint;
  /** `maxGas()` value used to bound the quote call. */
  readonly gasCap: bigint;
}

/** Currently usable (vault-aware) liquidity; size fills from this, never from reserves. */
export interface EffectiveLiquidityView {
  readonly poolId: PoolId;
  readonly effectiveLiquidity: readonly [bigint, bigint];
  readonly block: bigint;
}

/** Canonical skip codes for quote results; a zero quote is always a skip, never data. */
export type QuoteSkipCode =
  | "quote/zero-output"
  | "quote/view-error"
  | "quote/gas-unavailable"
  | "pool/not-live"
  | "hook/not-live";

// -------------------------------------------------------------------------------------------
// Quote service (WO-12). Block-aware, fail-closed, empty-hookData release path only.
// -------------------------------------------------------------------------------------------

import { decodeFunctionResult, encodeFunctionData, formatUnits } from "viem";
import type { Address, PublicClient } from "viem";
import { alfHookAbi } from "./abis.js";
import { POOL_MANAGER } from "./addresses.js";
import { getIndicativeQuoteSafe, readHookStats, readLiveness, readMaxGas } from "./alfQuote.js";
import { readErc20Info, type Erc20Info } from "./erc20.js";
import { readVanillaLiquidity } from "./poolState.js";
import { derivePoolId } from "./pool.js";
import type { PoolKey } from "./pool.js";
import { errorMessage, errorResult, okResult, skipResult } from "./result.js";
import type { ChainBlockContext, CommandResult, ErrorResult, Warning } from "./result.js";

/** Namespaced error codes owned by the quote service. */
export const QUOTE_ERROR_CODES = ["quote/input-invalid", "quote/read-failed"] as const;
export type QuoteErrorCode = (typeof QUOTE_ERROR_CODES)[number];

export const QUOTE_WARNING_CODES = [
  "quote/non-binding",
  "quote/size-divergence",
  "quote/stats-unavailable",
] as const;

export type QuoteWarningCode = (typeof QUOTE_WARNING_CODES)[number];

export interface QuoteServiceArgs {
  readonly hook: Address;
  readonly poolKey: PoolKey;
  readonly poolId?: import("./pool.js").PoolId;
  /** Swap direction: `true` swaps currency0 -> currency1 (v4 convention). */
  readonly zeroForOne: boolean;
  /** Exact-input amount in the input token's smallest unit. */
  readonly amountInRaw: bigint;
  readonly blockNumber?: bigint;
}

/** The three liquidity signals, kept distinct in meaning and units. */
export interface QuoteLiquidity {
  /** Vanilla PoolManager `getLiquidity` (raw v4 liquidity units, uint128-scale). */
  readonly vanillaPoolManager: bigint | null;
  /** DualPool total vault reserves (token smallest units); show, do not size fills from. */
  readonly reserves: readonly [bigint, bigint] | null;
  /** DualPool currently usable assets (token smallest units); size fills from this. */
  readonly effectiveLiquidity: readonly [bigint, bigint] | null;
}

export interface QuoteData {
  readonly poolId: import("./pool.js").PoolId;
  readonly poolKey: PoolKey;
  readonly direction: "exact-in";
  readonly zeroForOne: boolean;
  readonly amountInRaw: bigint;
  /** Human-readable input amount (decimal string via the token's decimals). */
  readonly amountInUnits: string;
  readonly inputToken: Erc20Info;
  readonly outputToken: Erc20Info;
  readonly outputAmountRaw: bigint;
  readonly outputAmountUnits: string;
  /** Hook-advertised `maxGas()` bound applied to the quote call. */
  readonly gasCap: bigint;
  readonly liquidity: QuoteLiquidity;
}

export interface PriceBoundedQuoteData {
  readonly poolId: import("./pool.js").PoolId;
  readonly poolKey: PoolKey;
  readonly zeroForOne: boolean;
  /** Derived from the v4 sign convention: negative = exact-in, positive = exact-out. */
  readonly direction: "exact-in" | "exact-out";
  readonly amountSpecified: bigint;
  readonly sqrtPriceLimitX96: bigint;
  readonly amountIn: bigint;
  readonly amountOut: bigint;
  readonly gasCap: bigint;
}

function chainContext(chainId: number, blockNumber: bigint | undefined): ChainBlockContext {
  return {
    chainId,
    blockNumber: blockNumber ?? null,
    blockSource: blockNumber !== undefined ? "pinned" : "latest",
  };
}

async function guardAndPin(
  client: PublicClient,
  input: object,
  blockNumber: bigint | undefined,
  command: "quote",
): Promise<{ chain: ChainBlockContext; atBlock: bigint } | { error: ErrorResult<object> }> {
  let chainId: number;
  try {
    chainId = await client.getChainId();
  } catch (error) {
    return {
      error: errorResult(command, chainContext(0, blockNumber), input, {
        code: "rpc/read-failed",
        message: `chain id probe failed: ${errorMessage(error)}`,
      }),
    };
  }
  if (chainId !== 1) {
    return {
      error: errorResult(command, chainContext(chainId, blockNumber), input, {
        code: "rpc/chain-mismatch",
        message: `quoting targets Ethereum chain 1 only; client reported chain ${chainId}`,
      }),
    };
  }
  if (blockNumber !== undefined) {
    return { chain: chainContext(chainId, blockNumber), atBlock: blockNumber };
  }
  let head: bigint;
  try {
    head = await client.getBlockNumber();
  } catch (error) {
    return {
      error: errorResult(command, chainContext(chainId, undefined), input, {
        code: "quote/read-failed",
        message: `head block probe failed: ${errorMessage(error)}`,
      }),
    };
  }
  return {
    chain: { chainId, blockNumber: head, blockSource: "latest" },
    atBlock: head,
  };
}

/** Liveness gate: any failure or false stops quoting with a typed skip. */
async function livenessGate(
  client: PublicClient,
  hook: Address,
  poolId: import("./pool.js").PoolId,
  atBlock: bigint,
): Promise<{ live: true } | { skip: { code: import("./quote.js").QuoteSkipCode; message: string } }> {
  let liveness: { hookLive: boolean; poolLive: boolean };
  try {
    liveness = await readLiveness(client, hook, poolId, atBlock);
  } catch (error) {
    return { skip: { code: "quote/view-error", message: `liveness reads failed: ${errorMessage(error)}` } };
  }
  if (!liveness.hookLive) return { skip: { code: "hook/not-live", message: "hook isLive() is false" } };
  if (!liveness.poolLive) return { skip: { code: "pool/not-live", message: "livePools(poolId) is false" } };
  return { live: true };
}

/**
 * Exact-input indicative quote through the hook's `getIndicativeQuote` with empty
 * `hookData`, bounded by the hook's `maxGas()`. Zero output and dead liveness are
 * typed skips; failed stats reads stay null with warnings, never guesses.
 */
export async function quoteExactIn(
  client: PublicClient,
  args: QuoteServiceArgs,
): Promise<CommandResult<QuoteData, QuoteInput>> {
  const poolId = args.poolId ?? derivePoolId(args.poolKey);
  const input: QuoteInput = { poolId, amount: args.amountInRaw, direction: "exact-in" };

  let guard: Awaited<ReturnType<typeof guardAndPin>>;
  guard = await guardAndPin(client, input, args.blockNumber, "quote");
  if ("error" in guard) return guard.error as ErrorResult<QuoteInput>;
  const { chain, atBlock } = guard;

  if (args.amountInRaw <= 0n) {
    return errorResult("quote", chain, input, {
      code: "quote/input-invalid",
      message: `amountInRaw must be positive; got ${args.amountInRaw}`,
    });
  }

  const gate = await livenessGate(client, args.hook, poolId, atBlock);
  if ("skip" in gate) return skipResult("quote", chain, input, gate.skip);

  let gasCap: bigint;
  try {
    gasCap = await readMaxGas(client, args.hook, atBlock);
  } catch (error) {
    return skipResult("quote", chain, input, {
      code: "quote/gas-unavailable",
      message: `maxGas() read failed: ${errorMessage(error)}`,
    });
  }

  const quote = await getIndicativeQuoteSafe(
    client,
    args.hook,
    args.poolKey,
    { zeroForOne: args.zeroForOne, amountSpecified: -args.amountInRaw },
    gasCap,
    atBlock,
  );
  if (quote.outputAmount === null) {
    return skipResult("quote", chain, input, {
      code: "quote/view-error",
      message: `getIndicativeQuote failed: ${errorMessage(quote.error ?? "unknown error")}`,
    });
  }
  if (quote.outputAmount === 0n) {
    return skipResult("quote", chain, input, {
      code: "quote/zero-output",
      message: "indicative quote is zero; treat as a skip, never a price",
    });
  }
  if (quote.hookDataEncoding !== "empty") {
    return skipResult("quote", chain, input, {
      code: "quote/view-error",
      message: `quote did not use empty DualPool hookData (${quote.hookDataEncoding})`,
    });
  }

  const inputTokenAddress = args.zeroForOne ? args.poolKey.currency0 : args.poolKey.currency1;
  const outputTokenAddress = args.zeroForOne ? args.poolKey.currency1 : args.poolKey.currency0;
  let inputToken: Erc20Info;
  let outputToken: Erc20Info;
  try {
    [inputToken, outputToken] = await Promise.all([
      readErc20Info(client, inputTokenAddress, atBlock),
      readErc20Info(client, outputTokenAddress, atBlock),
    ]);
  } catch (error) {
    return errorResult("quote", chain, input, {
      code: "rpc/read-failed",
      message: `token metadata reads failed: ${errorMessage(error)}`,
    });
  }

  const warnings: Warning[] = [
    { code: "quote/non-binding", message: "indicative quotes are not a firm price" },
    { code: "quote/size-divergence", message: "single-step simulation; execution can diverge at larger sizes" },
  ];
  let vanillaPoolManager: bigint | null = null;
  let reserves: readonly [bigint, bigint] | null = null;
  let effectiveLiquidity: readonly [bigint, bigint] | null = null;

  try {
    vanillaPoolManager = (await readVanillaLiquidity(client, POOL_MANAGER, poolId, atBlock)).liquidity;
  } catch (error) {
    warnings.push({
      code: "quote/stats-unavailable",
      message: `vanilla PoolManager liquidity unavailable: ${errorMessage(error)}`,
    });
  }
  const stats = await readHookStats(client, args.hook, args.poolKey, atBlock);
  if (stats.reserves !== null) reserves = stats.reserves;
  if (stats.effectiveLiquidity !== null) effectiveLiquidity = stats.effectiveLiquidity;
  if (stats.reserves === null) {
    warnings.push({
      code: "quote/stats-unavailable",
      message: `reserves unavailable: ${errorMessage(stats.errors.join("; "))}`,
    });
  }
  if (stats.effectiveLiquidity === null) {
    warnings.push({
      code: "quote/stats-unavailable",
      message: `effective liquidity unavailable: ${errorMessage(stats.errors.join("; "))}`,
    });
  }
  const liquidity: QuoteLiquidity = { vanillaPoolManager, reserves, effectiveLiquidity };

  return okResult(
    "quote",
    chain,
    input,
    {
      poolId,
      poolKey: args.poolKey,
      direction: "exact-in",
      zeroForOne: args.zeroForOne,
      amountInRaw: args.amountInRaw,
      amountInUnits: formatUnits(args.amountInRaw, inputToken.decimals),
      inputToken,
      outputToken,
      outputAmountRaw: quote.outputAmount,
      outputAmountUnits: formatUnits(quote.outputAmount, outputToken.decimals),
      gasCap,
      liquidity,
    },
    warnings,
  );
}

/** Price-bounded `swapToPrice` view; same guards, explicit limit, sanitized failures. */
export async function quoteSwapToPrice(
  client: PublicClient,
  args: {
    hook: Address;
    poolKey: PoolKey;
    poolId?: import("./pool.js").PoolId;
    zeroForOne: boolean;
    amountSpecified: bigint;
    sqrtPriceLimitX96: bigint;
    blockNumber?: bigint;
  },
): Promise<CommandResult<PriceBoundedQuoteData, QuoteInput>> {
  const poolId = args.poolId ?? derivePoolId(args.poolKey);
  const direction: "exact-in" | "exact-out" = args.amountSpecified < 0n ? "exact-in" : "exact-out";
  const input: QuoteInput = { poolId, amount: args.amountSpecified, direction };

  const guard = await guardAndPin(client, input, args.blockNumber, "quote");
  if ("error" in guard) return guard.error as ErrorResult<QuoteInput>;
  const { chain, atBlock } = guard;

  if (args.amountSpecified === 0n) {
    return errorResult("quote", chain, input, {
      code: "quote/input-invalid",
      message: "amountSpecified must be non-zero",
    });
  }

  const gate = await livenessGate(client, args.hook, poolId, atBlock);
  if ("skip" in gate) return skipResult("quote", chain, input, gate.skip);

  let gasCap: bigint;
  try {
    gasCap = await readMaxGas(client, args.hook, atBlock);
  } catch (error) {
    return skipResult("quote", chain, input, {
      code: "quote/gas-unavailable",
      message: `maxGas() read failed: ${errorMessage(error)}`,
    });
  }

  try {
    const data = encodeFunctionData({
      abi: alfHookAbi,
      functionName: "swapToPrice",
      args: [args.poolKey, args.zeroForOne, args.amountSpecified, args.sqrtPriceLimitX96, "0x"],
    });
    const result = await client.call({
      to: args.hook,
      data,
      gas: gasCap,
      blockNumber: atBlock,
    });
    if (result.data === undefined) throw new Error("eth_call returned no data");
    const [amountIn, amountOut] = decodeFunctionResult({
      abi: alfHookAbi,
      functionName: "swapToPrice",
      data: result.data,
    });
    return okResult(
      "quote",
      chain,
      input,
      { poolId, poolKey: args.poolKey, zeroForOne: args.zeroForOne, direction, amountSpecified: args.amountSpecified, sqrtPriceLimitX96: args.sqrtPriceLimitX96, amountIn, amountOut, gasCap },
      [
        { code: "quote/non-binding", message: "price-bounded views are not a firm price" },
        { code: "quote/size-divergence", message: "single-step simulation; execution can diverge at larger sizes" },
      ],
    );
  } catch (error) {
    return skipResult("quote", chain, input, {
      code: "quote/view-error",
      message: `swapToPrice failed: ${errorMessage(error)}`,
    });
  }
}

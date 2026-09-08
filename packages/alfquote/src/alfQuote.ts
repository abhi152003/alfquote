import { decodeFunctionResult, encodeFunctionData, encodeAbiParameters } from "viem";
import type { Address, Hex, PublicClient } from "viem";
import { alfHookAbi, hookStatsAbi, dualPoolHookViewsAbi } from "./abis.js";
import type { PoolKey } from "./pool.js";

/** `isLive()` and `livePools(poolId)` at `blockNumber`. */
export async function readLiveness(
  client: PublicClient,
  hook: Address,
  poolId: Hex,
  blockNumber: bigint,
): Promise<{ hookLive: boolean; poolLive: boolean }> {
  const [hookLive, poolLive] = await Promise.all([
    client.readContract({
      address: hook,
      abi: alfHookAbi,
      functionName: "isLive",
      blockNumber,
    }),
    client.readContract({
      address: hook,
      abi: dualPoolHookViewsAbi,
      functionName: "livePools",
      args: [poolId],
      blockNumber,
    }),
  ]);
  return { hookLive, poolLive };
}

/** Hook `maxGas()` at `blockNumber`. */
export async function readMaxGas(
  client: PublicClient,
  hook: Address,
  blockNumber: bigint,
): Promise<bigint> {
  const maxGas = await client.readContract({
    address: hook,
    abi: alfHookAbi,
    functionName: "maxGas",
    blockNumber,
  });
  return BigInt(maxGas);
}

export interface HookStatsResult {
  reserves: readonly [bigint, bigint] | null;
  effectiveLiquidity: readonly [bigint, bigint] | null;
  errors: readonly string[];
}

/** `getReserves` / `getEffectiveLiquidity`; call and decode, do not trust ERC-165. */
export async function readHookStats(
  client: PublicClient,
  hook: Address,
  key: PoolKey,
  blockNumber: bigint,
): Promise<HookStatsResult> {
  const errors: string[] = [];
  const attempt = async (
    functionName: "getReserves" | "getEffectiveLiquidity",
  ): Promise<readonly [bigint, bigint] | null> => {
    try {
      const result = await client.readContract({
        address: hook,
        abi: hookStatsAbi,
        functionName,
        args: [key],
        blockNumber,
      });
      return [result[0], result[1]];
    } catch (error) {
      errors.push(`${functionName}: ${error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200)}`);
      return null;
    }
  };

  const [reserves, effectiveLiquidity] = await Promise.all([
    attempt("getReserves"),
    attempt("getEffectiveLiquidity"),
  ]);
  return { reserves, effectiveLiquidity, errors };
}

export interface IndicativeQuoteResult {
  outputAmount: bigint | null;
  /** Encoding the hook accepted: empty bytes, `ALFHookData`, or neither. */
  hookDataEncoding: "empty" | "encoded-ALFHookData" | "none";
  error?: string;
}

async function callIndicativeQuote(
  client: PublicClient,
  hook: Address,
  key: PoolKey,
  params: { zeroForOne: boolean; amountSpecified: bigint },
  gas: bigint,
  blockNumber: bigint,
  hookData: Hex,
): Promise<bigint> {
  const data = encodeFunctionData({
    abi: alfHookAbi,
    functionName: "getIndicativeQuote",
    args: [key, params.zeroForOne, params.amountSpecified, hookData],
  });
  const result = await client.call({ to: hook, data, gas, blockNumber });
  if (result.data === undefined) {
    throw new Error("eth_call returned no data");
  }
  return decodeFunctionResult({
    abi: alfHookAbi,
    functionName: "getIndicativeQuote",
    data: result.data,
  });
}

/** Phase 1 quote: empty `hookData` only. */
export async function getIndicativeQuoteSafe(
  client: PublicClient,
  hook: Address,
  key: PoolKey,
  params: { zeroForOne: boolean; amountSpecified: bigint },
  gas: bigint,
  blockNumber: bigint,
): Promise<IndicativeQuoteResult> {
  try {
    return {
      outputAmount: await callIndicativeQuote(client, hook, key, params, gas, blockNumber, "0x"),
      hookDataEncoding: "empty",
    };
  } catch (emptyError) {
    return {
      outputAmount: null,
      hookDataEncoding: "none",
      error: `empty hookData: ${emptyError instanceof Error ? emptyError.message.slice(0, 200) : String(emptyError).slice(0, 200)}`,
    };
  }
}

/** Diagnostic encoded `ALFHookData`; not a Phase 1 pass path. */
export async function getIndicativeQuoteEncodedDiagnostic(
  client: PublicClient,
  hook: Address,
  key: PoolKey,
  params: { zeroForOne: boolean; amountSpecified: bigint },
  gas: bigint,
  blockNumber: bigint,
): Promise<IndicativeQuoteResult> {
  const encodedHookData = encodeAbiParameters(
    [
      {
        name: "alfHookData",
        type: "tuple",
        components: [{ name: "attestationData", type: "bytes" }],
      },
    ],
    [{ attestationData: "0x" }],
  );
  try {
    return {
      outputAmount: await callIndicativeQuote(
        client,
        hook,
        key,
        params,
        gas,
        blockNumber,
        encodedHookData,
      ),
      hookDataEncoding: "encoded-ALFHookData",
    };
  } catch (error) {
    return {
      outputAmount: null,
      hookDataEncoding: "none",
      error: error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200),
    };
  }
}

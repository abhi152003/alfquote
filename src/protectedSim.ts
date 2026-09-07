import type { Address, PublicClient } from "viem";
import { getIndicativeQuoteSafe, readMaxGas } from "./alfQuote.js";
import { readSwapAllowances, allowanceBlockers, type AllowanceSnapshot } from "./allowances.js";
import { FIXTURE_HOOK, PERMIT2, PINNED_POOL_KEY, UNIVERSAL_ROUTER } from "./addresses.js";
import { readErc20Info, type Erc20Info } from "./erc20.js";
import {
  simulateUniversalRouterExecute,
  type SimulateSwapResult,
} from "./simulateSwap.js";
import {
  DEFAULT_SLIPPAGE_BPS,
  amountOutMinimumFromQuote,
  encodeV4ExactInSingleExecute,
  type EncodedExecute,
} from "./v4Swap.js";

export function quoteFillGapBps(quote: bigint, actual: bigint): bigint {
  if (quote === 0n || actual >= quote) return 0n;
  return ((quote - actual) * 10_000n) / quote;
}

export interface ProtectedSimRun {
  amountIn: bigint;
  quote: bigint;
  amountOutMinimum: bigint;
  token0: Erc20Info;
  token1: Erc20Info;
  encoded: EncodedExecute;
  deadline: bigint;
  allowances: AllowanceSnapshot;
  allowanceIssues: string[];
  result: SimulateSwapResult;
}

export async function runProtectedSimulation(
  client: PublicClient,
  args: {
    sender: Address;
    amountUsdc: bigint;
    slippageBps?: bigint;
    blockNumber: bigint;
  },
): Promise<ProtectedSimRun> {
  const slippageBps = args.slippageBps ?? DEFAULT_SLIPPAGE_BPS;
  const key = PINNED_POOL_KEY;
  const [token0, token1] = await Promise.all([
    readErc20Info(client, key.currency0, args.blockNumber),
    readErc20Info(client, key.currency1, args.blockNumber),
  ]);
  const amountIn = args.amountUsdc * 10n ** BigInt(token0.decimals);
  const maxGas = await readMaxGas(client, FIXTURE_HOOK, args.blockNumber);
  const quote = await getIndicativeQuoteSafe(
    client,
    FIXTURE_HOOK,
    key,
    { zeroForOne: true, amountSpecified: -amountIn },
    maxGas,
    args.blockNumber,
  );
  if (quote.outputAmount === null || quote.outputAmount === 0n) {
    throw new Error(`Quote unusable at block ${args.blockNumber}: ${quote.error ?? "zero"}`);
  }
  if (quote.hookDataEncoding !== "empty") {
    throw new Error(`Quote did not use empty DualPool hookData (${quote.hookDataEncoding})`);
  }
  const amountOutMinimum = amountOutMinimumFromQuote(quote.outputAmount, slippageBps);
  const allowances = await readSwapAllowances(client, {
    token: key.currency0,
    sender: args.sender,
    permit2: PERMIT2,
    router: UNIVERSAL_ROUTER,
    blockNumber: args.blockNumber,
  });
  const now = (await client.getBlock({ blockNumber: args.blockNumber })).timestamp;
  const deadline = now + 600n;
  const encoded = encodeV4ExactInSingleExecute(
    {
      poolKey: key,
      zeroForOne: true,
      amountIn,
      amountOutMinimum,
      hookData: "0x",
    },
    "v2",
    deadline,
  );
  const result = await simulateUniversalRouterExecute(client, {
    sender: args.sender,
    commands: encoded.commands,
    inputs: encoded.inputs,
    deadline,
    blockNumber: args.blockNumber,
  });
  return {
    amountIn,
    quote: quote.outputAmount,
    amountOutMinimum,
    token0,
    token1,
    encoded,
    deadline,
    allowances,
    allowanceIssues: allowanceBlockers(allowances, amountIn, now),
    result,
  };
}

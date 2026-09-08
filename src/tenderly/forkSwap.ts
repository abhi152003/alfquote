/**
 * Protected DualPool swap execution on the controlled fork (WO-7).
 *
 * Quotes on the fork through the same empty-`hookData` `IALFHook` path used by
 * the mainnet proof, encodes the same Universal Router v2 `V4_SWAP` calldata,
 * executes it as a normal transaction from the dedicated test address, and
 * measures the delivered output. PASS requires receipt success AND actual
 * output at or above `amountOutMinimum`.
 */

import { toEventSelector } from "viem";
import type { Address, Hex } from "viem";
import { FIXTURE_HOOK, PINNED_POOL_KEY, UNIVERSAL_ROUTER } from "../addresses.js";
import type { IndicativeQuoteResult } from "../alfQuote.js";
import type { EncodedExecute } from "../v4Swap.js";
import {
  DEFAULT_SLIPPAGE_BPS,
  amountOutMinimumFromQuote,
  encodeV4ExactInSingleExecute,
} from "../v4Swap.js";
import type { ForkReceipt, ForkReader } from "./forkSetup.js";
import type { TenderlyAdmin } from "./adminClient.js";
import type { TenderlyConfig } from "./config.js";

export const TRANSFER_EVENT_SELECTOR = toEventSelector("Transfer(address,address,uint256)") as Hex;
export const POOL_MANAGER_SWAP_SELECTORS = [
  toEventSelector(
    "Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)",
  ),
  toEventSelector(
    "Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)",
  ),
] as const;
export const MODIFY_LIQUIDITY_SELECTOR = toEventSelector(
  "ModifyLiquidity(bytes32 indexed id, address indexed sender, int24 tickLower, int24 tickUpper, int256 liquidityDelta, bytes32 salt)",
);

export interface DecodedEventNote {
  emitter: Address;
  event: "Transfer" | "Swap" | "ModifyLiquidity";
  topic0: Hex;
  from?: Address;
  to?: Address;
  value?: bigint;
  sender?: Address;
}

export interface ForkSwapDeps extends ForkReader {
  maxGas(): Promise<bigint>;
  indicativeQuote(amountIn: bigint): Promise<IndicativeQuoteResult>;
  blockTimestamp(): Promise<bigint>;
}

export interface ForkSwapRun {
  amountIn: bigint;
  quote: bigint;
  slippageBps: bigint;
  amountOutMinimum: bigint;
  quoteBlock: bigint;
  deadline: bigint;
  encoded: EncodedExecute;
  tx: Hex;
  receipt: ForkReceipt;
  usdcBefore: bigint;
  usdcAfter: bigint;
  usdtBefore: bigint;
  usdtAfter: bigint;
  actualOut: bigint;
  usdcSpent: bigint;
  transfersToUserFromLogs: bigint;
  poolManagerSwapObserved: boolean;
  hookModifyLiquidityEvents: number;
  events: DecodedEventNote[];
  pass: boolean;
  failure?: string;
}

/** Decode Transfer / Swap / ModifyLiquidity notes from receipt logs; never throws. */
export function decodeSwapEvents(
  logs: ReadonlyArray<{ address: Address; topics: readonly Hex[]; data: Hex }>,
  args: { outputToken: Address; user: Address; hook: Address },
): {
  events: DecodedEventNote[];
  transfersToUser: bigint;
  poolManagerSwapObserved: boolean;
  hookModifyLiquidityEvents: number;
} {
  const events: DecodedEventNote[] = [];
  let transfersToUser = 0n;
  let poolManagerSwapObserved = false;
  let hookModifyLiquidityEvents = 0;
  // PoolManager Swap/ModifyLiquidity index (id, sender): sender is topics[2].
  const indexedSender = (log: { topics: readonly Hex[] }): Address | undefined =>
    log.topics.length > 2 ? (`0x${log.topics[2]?.slice(26)}` as Address) : undefined;
  for (const log of logs) {
    const topic0 = log.topics[0];
    if (topic0 === undefined) continue;
    if (topic0 === TRANSFER_EVENT_SELECTOR && log.topics.length === 3 && log.data.length >= 66) {
      const from = `0x${log.topics[1]?.slice(26)}` as Address;
      const to = `0x${log.topics[2]?.slice(26)}` as Address;
      const value = BigInt(log.data);
      events.push({ emitter: log.address, event: "Transfer", topic0, from, to, value });
      if (log.address.toLowerCase() === args.outputToken.toLowerCase() && to.toLowerCase() === args.user.toLowerCase()) {
        transfersToUser += value;
      }
      continue;
    }
    if (POOL_MANAGER_SWAP_SELECTORS.includes(topic0 as (typeof POOL_MANAGER_SWAP_SELECTORS)[number])) {
      poolManagerSwapObserved = true;
      events.push({ emitter: log.address, event: "Swap", topic0, sender: indexedSender(log) });
      continue;
    }
    if (topic0 === MODIFY_LIQUIDITY_SELECTOR) {
      const sender = indexedSender(log);
      events.push({ emitter: log.address, event: "ModifyLiquidity", topic0, sender });
      if (sender?.toLowerCase() === args.hook.toLowerCase()) hookModifyLiquidityEvents += 1;
    }
  }
  return { events, transfersToUser, poolManagerSwapObserved, hookModifyLiquidityEvents };
}

/**
 * Deadline for the UR `execute` call. Virtual Environments stamp mined blocks
 * with real-world time, so a latest-block timestamp can be stale after an idle
 * gap; the wall clock is the lower bound that always sits in the future.
 */
export function executeDeadline(latestBlockTimestamp: bigint, wallClockSeconds: bigint): bigint {
  return (latestBlockTimestamp > wallClockSeconds ? latestBlockTimestamp : wallClockSeconds) + 600n;
}

export async function runForkSwap(
  admin: TenderlyAdmin,
  deps: ForkSwapDeps,
  args: { config: TenderlyConfig; amountIn: bigint; slippageBps?: bigint; quoteBlock: bigint },
): Promise<ForkSwapRun> {
  const { config, amountIn } = args;
  const slippageBps = args.slippageBps ?? DEFAULT_SLIPPAGE_BPS;
  const key = PINNED_POOL_KEY;

  const quote = await deps.indicativeQuote(amountIn);
  if (quote.outputAmount === null || quote.outputAmount === 0n) {
    throw new Error(`Fork quote unusable: ${quote.error ?? "zero"}`);
  }
  if (quote.hookDataEncoding !== "empty") {
    throw new Error(`Fork quote did not use empty DualPool hookData (${quote.hookDataEncoding})`);
  }
  const amountOutMinimum = amountOutMinimumFromQuote(quote.outputAmount, slippageBps);

  const [usdcBefore, usdtBefore, blockTimestamp] = await Promise.all([
    deps.erc20Balance(key.currency0, config.from),
    deps.erc20Balance(key.currency1, config.from),
    deps.blockTimestamp(),
  ]);
  const deadline = executeDeadline(blockTimestamp, BigInt(Math.floor(Date.now() / 1000)));
  const encoded = encodeV4ExactInSingleExecute(
    { poolKey: key, zeroForOne: true, amountIn, amountOutMinimum, hookData: "0x" },
    "v2",
    deadline,
  );

  const tx = await admin.sendUnsignedTransaction({
    from: config.from,
    to: UNIVERSAL_ROUTER,
    data: encoded.calldata,
    value: 0n,
  });
  const receipt = await deps.waitForReceipt(tx);
  const [usdcAfter, usdtAfter] = await Promise.all([
    deps.erc20Balance(key.currency0, config.from),
    deps.erc20Balance(key.currency1, config.from),
  ]);
  const actualOut = usdtAfter > usdtBefore ? usdtAfter - usdtBefore : 0n;
  const usdcSpent = usdcBefore > usdcAfter ? usdcBefore - usdcAfter : 0n;

  const decoded = decodeSwapEvents(receipt.logs, {
    outputToken: key.currency1,
    user: config.from,
    hook: FIXTURE_HOOK,
  });

  let failure: string | undefined;
  if (receipt.status !== "success") {
    failure = `swap transaction ${tx} reverted on the Virtual Environment (decode via the dashboard trace or an eth_call replay)`;
  } else if (actualOut < amountOutMinimum) {
    failure = `actual output ${actualOut} below amountOutMinimum ${amountOutMinimum}`;
  }

  return {
    amountIn,
    quote: quote.outputAmount,
    slippageBps,
    amountOutMinimum,
    quoteBlock: args.quoteBlock,
    deadline,
    encoded,
    tx,
    receipt,
    usdcBefore,
    usdcAfter,
    usdtBefore,
    usdtAfter,
    actualOut,
    usdcSpent,
    transfersToUserFromLogs: decoded.transfersToUser,
    poolManagerSwapObserved: decoded.poolManagerSwapObserved,
    hookModifyLiquidityEvents: decoded.hookModifyLiquidityEvents,
    events: decoded.events,
    pass: failure === undefined,
    failure,
  };
}

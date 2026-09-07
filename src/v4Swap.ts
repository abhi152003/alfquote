import { concatHex, encodeAbiParameters, encodeFunctionData } from "viem";
import type { Address, Hex } from "viem";
import { universalRouterAbi } from "./abis.js";
import type { PoolKey } from "./pool.js";

export const V4_SWAP_COMMAND = 0x10;
export const SWAP_EXACT_IN_SINGLE = 0x06;
export const SETTLE_ALL = 0x0c;
export const TAKE_ALL = 0x0f;
export const DEFAULT_SLIPPAGE_BPS = 50n;

const POOL_KEY_COMPONENTS = [
  { name: "currency0", type: "address" },
  { name: "currency1", type: "address" },
  { name: "fee", type: "uint24" },
  { name: "tickSpacing", type: "int24" },
  { name: "hooks", type: "address" },
] as const;

/** UR v2 swap params (no `minHopPriceX36`). */
const EXACT_IN_SINGLE_V2 = [
  {
    name: "params",
    type: "tuple",
    components: [
      { name: "poolKey", type: "tuple", components: [...POOL_KEY_COMPONENTS] },
      { name: "zeroForOne", type: "bool" },
      { name: "amountIn", type: "uint128" },
      { name: "amountOutMinimum", type: "uint128" },
      { name: "hookData", type: "bytes" },
    ],
  },
] as const;

const EXACT_IN_SINGLE_V211 = [
  {
    name: "params",
    type: "tuple",
    components: [
      { name: "poolKey", type: "tuple", components: [...POOL_KEY_COMPONENTS] },
      { name: "zeroForOne", type: "bool" },
      { name: "amountIn", type: "uint128" },
      { name: "amountOutMinimum", type: "uint128" },
      { name: "minHopPriceX36", type: "uint256" },
      { name: "hookData", type: "bytes" },
    ],
  },
] as const;

export type UrEncoding = "v2" | "v2.1.1";

export function amountOutMinimumFromQuote(quote: bigint, slippageBps: bigint): bigint {
  if (slippageBps < 0n || slippageBps >= 10_000n) {
    throw new Error(`slippage bps must be in [0, 10000); got ${slippageBps}`);
  }
  return (quote * (10_000n - slippageBps)) / 10_000n;
}

export interface ExactInSingleSwap {
  poolKey: PoolKey;
  zeroForOne: boolean;
  amountIn: bigint;
  amountOutMinimum: bigint;
  hookData?: Hex;
}

export interface EncodedExecute {
  encoding: UrEncoding;
  commands: Hex;
  inputs: readonly Hex[];
  actions: Hex;
  calldata: Hex;
}

function encodeSwapParams(swap: ExactInSingleSwap, encoding: UrEncoding): Hex {
  const hookData = swap.hookData ?? "0x";
  const key = {
    currency0: swap.poolKey.currency0,
    currency1: swap.poolKey.currency1,
    fee: swap.poolKey.fee,
    tickSpacing: swap.poolKey.tickSpacing,
    hooks: swap.poolKey.hooks,
  };
  if (encoding === "v2.1.1") {
    return encodeAbiParameters(EXACT_IN_SINGLE_V211, [
      {
        poolKey: key,
        zeroForOne: swap.zeroForOne,
        amountIn: swap.amountIn,
        amountOutMinimum: swap.amountOutMinimum,
        minHopPriceX36: 0n,
        hookData,
      },
    ]);
  }
  return encodeAbiParameters(EXACT_IN_SINGLE_V2, [
    {
      poolKey: key,
      zeroForOne: swap.zeroForOne,
      amountIn: swap.amountIn,
      amountOutMinimum: swap.amountOutMinimum,
      hookData,
    },
  ]);
}

function currencyAndAmount(currency: Address, amount: bigint): Hex {
  return encodeAbiParameters(
    [
      { name: "currency", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    [currency, amount],
  );
}

export function encodeExecuteCalldata(commands: Hex, inputs: readonly Hex[], deadline: bigint): Hex {
  return encodeFunctionData({
    abi: universalRouterAbi,
    functionName: "execute",
    args: [commands, [...inputs], deadline],
  });
}

export function encodeV4ExactInSingleExecute(
  swap: ExactInSingleSwap,
  encoding: UrEncoding = "v2",
  deadline: bigint = 0n,
): EncodedExecute {
  const actions = concatHex([
    `0x${SWAP_EXACT_IN_SINGLE.toString(16).padStart(2, "0")}`,
    `0x${SETTLE_ALL.toString(16).padStart(2, "0")}`,
    `0x${TAKE_ALL.toString(16).padStart(2, "0")}`,
  ] as Hex[]);
  const currencyIn = swap.zeroForOne ? swap.poolKey.currency0 : swap.poolKey.currency1;
  const currencyOut = swap.zeroForOne ? swap.poolKey.currency1 : swap.poolKey.currency0;
  const params = [
    encodeSwapParams(swap, encoding),
    currencyAndAmount(currencyIn, swap.amountIn),
    currencyAndAmount(currencyOut, swap.amountOutMinimum),
  ];
  const v4Input = encodeAbiParameters(
    [
      { name: "actions", type: "bytes" },
      { name: "params", type: "bytes[]" },
    ],
    [actions, params],
  );
  const commands = `0x${V4_SWAP_COMMAND.toString(16).padStart(2, "0")}` as Hex;
  return {
    encoding,
    commands,
    inputs: [v4Input],
    actions,
    calldata: encodeExecuteCalldata(commands, [v4Input], deadline),
  };
}

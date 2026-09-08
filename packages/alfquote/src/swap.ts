/**
 * Protected swap construction and read-only simulation types. Phase 2 is
 * dry-run only: a live send is out of scope, so `SwapMode` has one value.
 */

import type { Hex } from "viem";
import type { PoolKey, PoolId } from "./pool.js";
import type { UrEncoding } from "./v4Swap.js";
import type { SimulateRevert } from "./simulateSwap.js";

/** Phase 2 execution mode; adding `"live"` requires an explicit product decision. */
export type SwapMode = "dry-run";

export interface SwapInput {
  readonly poolId: PoolId;
  readonly amountIn: bigint;
  readonly slippageBps: bigint;
  readonly mode: SwapMode;
}

/** Everything needed to inspect or broadcast a protected Universal Router swap. */
export interface ProtectedSwapPlan {
  readonly poolKey: PoolKey;
  readonly zeroForOne: boolean;
  readonly amountIn: bigint;
  readonly amountOutMinimum: bigint;
  readonly slippageBps: bigint;
  readonly deadline: bigint;
  readonly encoding: UrEncoding;
  readonly commands: Hex;
  readonly inputs: readonly Hex[];
  readonly calldata: Hex;
}

/** Read-only `eth_call`/`eth_estimateGas` outcome for a swap plan. */
export interface SwapSimulationOutcome {
  readonly ok: boolean;
  readonly gas?: bigint;
  readonly revert?: SimulateRevert;
}

// -------------------------------------------------------------------------------------------
// Protected swap service (WO-13). Read-only planning and simulation; UR v2 encoding only,
// empty hookData, explicit slippage, dry-run only — never a transaction-send API.
// -------------------------------------------------------------------------------------------

import type { Address, PublicClient } from "viem";
import { PERMIT2, UNIVERSAL_ROUTER } from "./addresses.js";
import { allowanceBlockers, readSwapAllowances, type AllowanceSnapshot } from "./allowances.js";
import { derivePoolId } from "./pool.js";
import { errorMessage, errorResult, okResult } from "./result.js";
import type { ChainBlockContext, CommandResult, ErrorResult, Warning } from "./result.js";
import {
  DEFAULT_SLIPPAGE_BPS,
  amountOutMinimumFromQuote,
  encodeV4ExactInSingleExecute,
} from "./v4Swap.js";
import { simulateUniversalRouterExecute } from "./simulateSwap.js";

/** Namespaced error codes owned by the swap service. */
export const SWAP_ERROR_CODES = ["swap/input-invalid", "swap/read-failed"] as const;
export type SwapErrorCode = (typeof SWAP_ERROR_CODES)[number];

export const SWAP_WARNING_CODES = [
  "swap/no-execution-certainty",
  "swap/allowance-blockers",
] as const;

export type SwapWarningCode = (typeof SWAP_WARNING_CODES)[number];

export interface SwapPlanArgs {
  readonly poolKey: PoolKey;
  readonly zeroForOne: boolean;
  readonly amountInRaw: bigint;
  /** The indicative quote this plan is derived from; must be positive. */
  readonly quotedOutputRaw: bigint;
  /** Explicit slippage in bps; defaults to 50. `0n` opts into bound == quote deliberately. */
  readonly slippageBps?: bigint;
  /** Caller-computed execution deadline (unix seconds). */
  readonly deadline: bigint;
}

/** A fully-derived protected swap plan plus its slippage provenance. */
export interface SwapPlan extends ProtectedSwapPlan {
  /** The UR action bytes (e.g. `0x060c0f`) for inspection. */
  readonly actions: Hex;
  readonly quotedOutputRaw: bigint;
  readonly slippageBps: bigint;
}

export interface SwapSimulationArgs {
  readonly sender: Address;
  readonly plan: SwapPlan;
  readonly permit2?: Address;
  readonly router?: Address;
  readonly blockNumber?: bigint;
}

export interface SwapSimulationReport {
  readonly plan: SwapPlan;
  /** The state block the simulation ran against; never a future-execution guarantee. */
  readonly stateBlockUsed: bigint;
  readonly gas?: bigint;
  readonly revert?: SimulateRevert;
  readonly allowances: AllowanceSnapshot;
  /** Missing balance or either allowance layer; must be fixed, never bypassed. */
  readonly allowanceIssues: readonly string[];
}

const PLANNING_CHAIN: ChainBlockContext = { chainId: 1, blockNumber: null, blockSource: "latest" };

/**
 * Build the protected Universal Router v2 calldata from a typed PoolKey and quote.
 * Pure: no chain reads, no signing, no sending. `V4_SWAP` with
 * `SWAP_EXACT_IN_SINGLE`, `SETTLE_ALL`, `TAKE_ALL`, and empty `hookData`.
 */
export function planProtectedSwap(args: SwapPlanArgs): CommandResult<SwapPlan, SwapInput> {
  const poolId = derivePoolId(args.poolKey);
  const slippageBps = args.slippageBps ?? DEFAULT_SLIPPAGE_BPS;
  const input: SwapInput = { poolId, amountIn: args.amountInRaw, slippageBps, mode: "dry-run" };

  if (args.amountInRaw <= 0n) {
    return errorResult("swap", PLANNING_CHAIN, input, {
      code: "swap/input-invalid",
      message: `amountInRaw must be positive; got ${args.amountInRaw}`,
    });
  }
  if (args.quotedOutputRaw <= 0n) {
    return errorResult("swap", PLANNING_CHAIN, input, {
      code: "swap/input-invalid",
      message: "quotedOutputRaw must be positive; a zero quote must be a skip, never a plan",
    });
  }
  let amountOutMinimum: bigint;
  try {
    amountOutMinimum = amountOutMinimumFromQuote(args.quotedOutputRaw, slippageBps);
  } catch (error) {
    return errorResult("swap", PLANNING_CHAIN, input, {
      code: "swap/input-invalid",
      message: errorMessage(error),
    });
  }
  if (amountOutMinimum <= 0n) {
    return errorResult("swap", PLANNING_CHAIN, input, {
      code: "swap/input-invalid",
      message: `derived amountOutMinimum is ${amountOutMinimum}; slippage ${slippageBps} bps consumes the whole quote`,
    });
  }

  const encoded = encodeV4ExactInSingleExecute(
    {
      poolKey: args.poolKey,
      zeroForOne: args.zeroForOne,
      amountIn: args.amountInRaw,
      amountOutMinimum,
      hookData: "0x",
    },
    "v2",
    args.deadline,
  );

  return okResult("swap", PLANNING_CHAIN, input, {
    poolKey: args.poolKey,
    zeroForOne: args.zeroForOne,
    amountIn: args.amountInRaw,
    amountOutMinimum,
    slippageBps,
    deadline: args.deadline,
    encoding: encoded.encoding,
    commands: encoded.commands,
    inputs: encoded.inputs,
    calldata: encoded.calldata,
    actions: encoded.actions,
    quotedOutputRaw: args.quotedOutputRaw,
  });
}

async function guardAndPin(
  client: PublicClient,
  input: SwapInput,
  blockNumber: bigint | undefined,
): Promise<{ chain: ChainBlockContext; atBlock: bigint } | { error: ErrorResult<SwapInput> }> {
  let chainId: number;
  try {
    chainId = await client.getChainId();
  } catch (error) {
    return {
      error: errorResult("swap", { chainId: 0, blockNumber: null, blockSource: "latest" }, input, {
        code: "rpc/read-failed",
        message: `chain id probe failed: ${errorMessage(error)}`,
      }),
    };
  }
  if (chainId !== 1) {
    return {
      error: errorResult("swap", { chainId, blockNumber: blockNumber ?? null, blockSource: blockNumber !== undefined ? "pinned" : "latest" }, input, {
        code: "rpc/chain-mismatch",
        message: `simulation targets Ethereum chain 1 only; client reported chain ${chainId}`,
      }),
    };
  }
  if (blockNumber !== undefined) {
    return {
      chain: { chainId, blockNumber, blockSource: "pinned" },
      atBlock: blockNumber,
    };
  }
  let head: bigint;
  try {
    head = await client.getBlockNumber();
  } catch (error) {
    return {
      error: errorResult("swap", { chainId, blockNumber: null, blockSource: "latest" }, input, {
        code: "swap/read-failed",
        message: `head block probe failed: ${errorMessage(error)}`,
      }),
    };
  }
  return { chain: { chainId, blockNumber: head, blockSource: "latest" }, atBlock: head };
}

/**
 * Read-only simulation of a plan from a caller-supplied address. Returns the
 * state block used, gas estimate, decoded revert evidence, and allowance
 * blockers; the result carries no future-execution certainty.
 */
export async function simulateProtectedSwap(
  client: PublicClient,
  args: SwapSimulationArgs,
): Promise<CommandResult<SwapSimulationReport, SwapInput>> {
  const input: SwapInput = {
    poolId: derivePoolId(args.plan.poolKey),
    amountIn: args.plan.amountIn,
    slippageBps: args.plan.slippageBps,
    mode: "dry-run",
  };

  const guard = await guardAndPin(client, input, args.blockNumber);
  if ("error" in guard) return guard.error;
  const { chain, atBlock } = guard;

  let now: bigint;
  let allowances: AllowanceSnapshot;
  try {
    const [block, snapshot] = await Promise.all([
      client.getBlock({ blockNumber: atBlock }),
      readSwapAllowances(client, {
        token: args.plan.zeroForOne ? args.plan.poolKey.currency0 : args.plan.poolKey.currency1,
        sender: args.sender,
        permit2: args.permit2 ?? PERMIT2,
        router: args.router ?? UNIVERSAL_ROUTER,
        blockNumber: atBlock,
      }),
    ]);
    now = block.timestamp;
    allowances = snapshot;
  } catch (error) {
    return errorResult("swap", chain, input, {
      code: "swap/read-failed",
      message: `allowance reads failed: ${errorMessage(error)}`,
    });
  }
  const allowanceIssues = allowanceBlockers(allowances, args.plan.amountIn, now);

  const result = await simulateUniversalRouterExecute(client, {
    sender: args.sender,
    commands: args.plan.commands,
    inputs: args.plan.inputs,
    deadline: args.plan.deadline,
    blockNumber: atBlock,
  });

  const warnings: Warning[] = [
    {
      code: "swap/no-execution-certainty",
      message: `simulated against block ${atBlock}; a later transaction can meet different state`,
    },
  ];
  if (allowanceIssues.length > 0) {
    warnings.push({
      code: "swap/allowance-blockers",
      message: `${allowanceIssues.length} balance or allowance blocker(s); they must be fixed, never bypassed`,
    });
  }

  return okResult(
    "swap",
    chain,
    input,
    {
      plan: args.plan,
      stateBlockUsed: atBlock,
      ...(result.ok ? { gas: result.gas } : {}),
      ...(result.revert !== undefined ? { revert: result.revert } : {}),
      allowances,
      allowanceIssues,
    },
    warnings,
  );
}

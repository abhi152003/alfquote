/**
 * Protected swap construction and read-only simulation types. Phase 2 is
 * dry-run only: a live send is out of scope, so `SwapMode` has one value.
 */

import type { Hex } from "viem";
import type { PoolKey } from "./pool.js";
import type { UrEncoding } from "./v4Swap.js";
import type { SimulateRevert } from "./simulateSwap.js";

/** Phase 2 execution mode; adding `"live"` requires an explicit product decision. */
export type SwapMode = "dry-run";

export interface SwapInput {
  readonly poolId: Hex;
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

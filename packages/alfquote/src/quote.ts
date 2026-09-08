/** Public quote view types (service implementation lands with the quote work order). */

import type { Hex } from "viem";

/** Swap direction requested by the caller. */
export type QuoteDirection = "exact-in" | "exact-out";

export interface QuoteInput {
  readonly poolId: Hex;
  readonly amount: bigint;
  readonly direction: QuoteDirection;
}

/**
 * Hook-aware indicative quote. `amountSpecified` follows the v4 convention:
 * negative for exact input, positive for exact output.
 */
export interface IndicativeQuoteView {
  readonly poolId: Hex;
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
  readonly poolId: Hex;
  readonly effectiveLiquidity: readonly [bigint, bigint];
  readonly block: bigint;
}

/** Canonical skip codes for quote results; a zero quote is always a skip, never data. */
export type QuoteSkipCode =
  | "quote/zero-output"
  | "quote/view-error"
  | "pool/not-live"
  | "hook/not-live";

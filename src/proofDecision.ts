export type ProofDecision = "PROCEED" | "REVISE" | "STOP";

/** Persistent PoolManager `L` at or below this is "near zero" for the negative-liquidity proof. */
export const NEAR_ZERO_VANILLA_LIQUIDITY = 10n;

export interface ProofSignals {
  livenessReadOk: boolean;
  hookLive: boolean;
  poolLive: boolean;
  maxGasReadOk: boolean;
  reservesReadOk: boolean;
  effectiveLiquidity: readonly [bigint, bigint] | null;
  /** Quote was attempted and empty `hookData` failed. */
  quoteCallFailed: boolean;
  /** Quote output, or null if skipped/failed. */
  quoteOutput: bigint | null;
  /** PoolManager slot0 word is non-zero (pool initialized). */
  slot0Populated: boolean;
  /** Persistent PoolManager liquidity (`L` units). */
  vanillaLiquidity: bigint;
}

/** REVISE on failed reads; STOP if not live, empty slot0, vanilla L too high, or no quote/capacity. */
export function decideProof(signals: ProofSignals): ProofDecision {
  if (
    !signals.livenessReadOk ||
    !signals.maxGasReadOk ||
    !signals.reservesReadOk ||
    signals.effectiveLiquidity === null ||
    signals.quoteCallFailed
  ) {
    return "REVISE";
  }

  const live = signals.hookLive && signals.poolLive;
  const effectivePositive =
    signals.effectiveLiquidity[0] > 0n || signals.effectiveLiquidity[1] > 0n;
  const quotePositive = signals.quoteOutput !== null && signals.quoteOutput > 0n;
  if (!signals.slot0Populated) return "STOP";
  if (signals.vanillaLiquidity > NEAR_ZERO_VANILLA_LIQUIDITY) return "STOP";
  if (live && effectivePositive && quotePositive) return "PROCEED";
  return "STOP";
}

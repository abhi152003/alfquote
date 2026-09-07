export type ProofDecision = "PROCEED" | "REVISE" | "STOP";

export interface ProofSignals {
  livenessReadOk: boolean;
  hookLive: boolean;
  poolLive: boolean;
  maxGasReadOk: boolean;
  reservesReadOk: boolean;
  effectiveLiquidity: readonly [bigint, bigint] | null;
  /** Quote was attempted and both `hookData` encodings failed. */
  quoteCallFailed: boolean;
  /** Quote output, or null if skipped/failed. */
  quoteOutput: bigint | null;
}

/** REVISE on failed reads; STOP if not live or no capacity/quote; PROCEED only if live + positive effective + positive quote. */
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
  if (live && effectivePositive && quotePositive) return "PROCEED";
  return "STOP";
}

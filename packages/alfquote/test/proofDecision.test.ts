import { describe, expect, it } from "vitest";
import { decideProof, type ProofSignals } from "../src/proofDecision.js";

const livePositive: ProofSignals = {
  livenessReadOk: true,
  hookLive: true,
  poolLive: true,
  maxGasReadOk: true,
  reservesReadOk: true,
  effectiveLiquidity: [1n, 1n],
  quoteCallFailed: false,
  quoteOutput: 1n,
  slot0Populated: true,
  vanillaLiquidity: 0n,
};

describe("decideProof", () => {
  it("PROCEED only when live, effective liquidity positive, and quote positive", () => {
    expect(decideProof(livePositive)).toBe("PROCEED");
  });

  it("REVISE when a required read failed", () => {
    expect(decideProof({ ...livePositive, livenessReadOk: false })).toBe("REVISE");
    expect(decideProof({ ...livePositive, maxGasReadOk: false })).toBe("REVISE");
    expect(decideProof({ ...livePositive, reservesReadOk: false })).toBe("REVISE");
    expect(decideProof({ ...livePositive, effectiveLiquidity: null })).toBe("REVISE");
    expect(decideProof({ ...livePositive, quoteCallFailed: true, quoteOutput: null })).toBe(
      "REVISE",
    );
  });

  it("STOP when the pool is not live (quote skipped, not a failed call)", () => {
    expect(
      decideProof({
        ...livePositive,
        poolLive: false,
        quoteOutput: null,
        quoteCallFailed: false,
      }),
    ).toBe("STOP");
  });

  it("STOP on zero quote or zero effective liquidity", () => {
    expect(decideProof({ ...livePositive, quoteOutput: 0n })).toBe("STOP");
    expect(decideProof({ ...livePositive, effectiveLiquidity: [0n, 0n] })).toBe("STOP");
  });

  it("STOP when slot0 is uninitialized", () => {
    expect(decideProof({ ...livePositive, slot0Populated: false })).toBe("STOP");
  });

  it("STOP when vanilla liquidity is above the near-zero threshold", () => {
    expect(decideProof({ ...livePositive, vanillaLiquidity: 11n })).toBe("STOP");
    expect(decideProof({ ...livePositive, vanillaLiquidity: 10n })).toBe("PROCEED");
  });
});

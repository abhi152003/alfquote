/** Renderer + exit-code tests: stable JSON, sectioned human output, redaction. */
import { describe, expect, it } from "vitest";
import { errorResult, okResult, skipResult } from "alfquote";
import { renderHuman, renderJson } from "../src/render.js";
import { EXIT_BLOCKED, EXIT_INTERNAL, EXIT_INVALID_INPUT, EXIT_OK, EXIT_SKIP, EXIT_UNAVAILABLE_EVIDENCE, EXIT_CONFIG } from "../src/exit.js";

const chain = { chainId: 1, blockNumber: 25_930_000n, blockSource: "pinned" as const };
const ANSI = /\u001b\[[0-9;]*m/;

describe("renderJson", () => {
  it("emits the versioned envelope for every status with no ANSI codes", () => {
    const results = [
      okResult("quote", chain, {}, { out: 1n }),
      skipResult("quote", chain, {}, { code: "quote/zero-output", message: "zero" }),
      errorResult("quote", chain, {}, { code: "rpc/read-failed", message: "node failed https://eth.example/v2/KEY1234567890" }),
    ];
    for (const result of results) {
      const text = renderJson(result);
      expect(ANSI.test(text)).toBe(false);
      const parsed = JSON.parse(text) as { schemaVersion: number; status: string; warnings: unknown[] };
      expect(parsed.schemaVersion).toBe(1);
      expect(typeof parsed.status).toBe("string");
      expect(Array.isArray(parsed.warnings)).toBe(true);
    }
  });

  it("redacts credential-bearing URLs inside envelope error messages", () => {
    const text = renderJson(errorResult("quote", chain, {}, { code: "rpc/read-failed", message: "failed https://eth.example/v2/KEY1234567890" }));
    expect(text).toContain("/v2/***");
    expect(text).not.toContain("KEY1234567890");
  });
});

describe("renderHuman", () => {
  it("separates status, summary, warnings, and caveats", () => {
    const text = renderHuman(
      okResult("quote", chain, { poolId: "0xabc" }, {
        amountInUnits: "1",
        outputAmountUnits: "1.000012",
        outputAmountRaw: 1_000_012n,
        gasCap: 800_000n,
        inputToken: { decimals: 6, symbol: "USDC" },
        outputToken: { decimals: 6, symbol: "USDT" },
        liquidity: { vanillaPoolManager: 0n, reserves: [1n, 2n], effectiveLiquidity: [1n, 2n] },
      }, [{ code: "quote/non-binding", message: "not a firm price" }]),
    );
    expect(text).toContain("alfquote quote: OK");
    expect(text).toContain("1 USDC → 1.000012 USDT");
    expect(text).toContain("warnings:");
    expect(text).toContain("quote/non-binding");
    expect(text).toContain("caveat: indicative quotes are non-binding");
  });

  it("renders skips with their code and a do-not-route caveat", () => {
    const text = renderHuman(skipResult("quote", chain, {}, { code: "quote/zero-output", message: "zero" }));
    expect(text).toContain("SKIP");
    expect(text).toContain("quote/zero-output");
    expect(text).toContain("not a price");
  });

  it("renders assessment dimensions as independent lines with evidence", () => {
    const text = renderHuman(okResult("assess", chain, {}, {
      compatibility: { status: "supported", evidence: [{ observed: "erc165(0x7adbfbb8)=true" }] },
      provenance: { status: "fixture", evidence: [{ observed: "explicit fixture input" }] },
      routing: { status: "automatic", evidence: [] },
      upgradeability: { status: "not-detected", evidence: [] },
    }));
    expect(text).toContain("compatibility: supported");
    expect(text).toContain("provenance: fixture");
    expect(text).toContain("erc165(0x7adbfbb8)=true");
    expect(text).toContain("no combined verdict");
  });

  it("renders swap blockers under a fix-them heading", () => {
    const text = renderHuman(okResult("swap", chain, {}, {
      plan: { amountIn: 1n, amountOutMinimum: 1n, slippageBps: 50n },
      stateBlockUsed: 25_930_000n,
      allowanceIssues: ["sender USDC balance 0 < amountIn 1000000"],
    }));
    expect(text).toContain("blockers (fix these; they are never bypassed):");
    expect(text).toContain("dry-run only");
  });
});

describe("exit codes", () => {
  it("documents the full set distinctly", () => {
    const codes = [EXIT_OK, EXIT_INTERNAL, EXIT_SKIP, EXIT_INVALID_INPUT, EXIT_UNAVAILABLE_EVIDENCE, EXIT_BLOCKED, EXIT_CONFIG];
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});

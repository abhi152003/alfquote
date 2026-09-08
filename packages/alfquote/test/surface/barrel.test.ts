/**
 * Surface owner: the barrel and the package entry points. Asserts the main
 * entry is exactly the union of its star-exported modules plus the explicit
 * `alfQuote.js` block, that no Phase 1 fixture name leaks into it, and that
 * the package manifests point `types` at shipped declarations.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import * as barrel from "../../src/index.js";
import * as phase1 from "../../src/phase1.js";
import * as result from "../../src/result.js";
import * as codes from "../../src/codes.js";
import * as serialize from "../../src/serialize.js";
import * as assessment from "../../src/assessment.js";
import * as quote from "../../src/quote.js";
import * as swap from "../../src/swap.js";
import * as abis from "../../src/abis.js";
import * as addresses from "../../src/addresses.js";
import * as pool from "../../src/pool.js";
import * as poolState from "../../src/poolState.js";
import * as interfaceId from "../../src/interfaceId.js";
import * as discovery from "../../src/discovery.js";
import * as hookChecks from "../../src/hookChecks.js";
import * as erc20 from "../../src/erc20.js";
import * as allowances from "../../src/allowances.js";
import * as proofDecision from "../../src/proofDecision.js";
import * as v4Swap from "../../src/v4Swap.js";
import * as simulateSwap from "../../src/simulateSwap.js";
import * as output from "../../src/output.js";

const STAR_MODULES = [
  result, codes, serialize, assessment, quote, swap, abis, addresses, pool,
  poolState, interfaceId, discovery, hookChecks, erc20, allowances,
  proofDecision, v4Swap, simulateSwap, output,
];

/** The explicit (non-star) part of the barrel: the mixed `alfQuote.js` block. */
const ALFQUOTE_MAIN_EXPORTS = [
  "getIndicativeQuoteSafe",
  "readHookStats",
  "readLiveness",
  "readMaxGas",
];

describe("surface: main barrel", () => {
  it("is exactly the union of its star-exported modules plus the explicit alfQuote block", () => {
    const expected = new Set<string>(ALFQUOTE_MAIN_EXPORTS);
    for (const mod of STAR_MODULES) {
      for (const key of Object.keys(mod)) expected.add(key);
    }
    expect(Object.keys(barrel).sort()).toEqual([...expected].sort());
  });

  it("leaks no Phase 1 fixture, diagnostic, or fixture-locked simulation name", () => {
    for (const key of Object.keys(phase1)) {
      expect(Object.keys(barrel)).not.toContain(key);
    }
  });
});

describe("surface: phase1 entry", () => {
  it("exports exactly the fixture constants, diagnostic quote, and fixture simulation", () => {
    expect(Object.keys(phase1).sort()).toEqual([
      "DEMO_POOL_INIT",
      "FACTORY_BIRTH_BLOCK",
      "FACTORY_REGISTRY_SNAPSHOT",
      "FIXTURE_HOOK",
      "FIXTURE_HOOK_BIRTH_BLOCK",
      "FIXTURE_POOL_ID",
      "PINNED_POOL_KEY",
      "POOL_MANAGER_BIRTH_BLOCK",
      "getIndicativeQuoteEncodedDiagnostic",
      "runProtectedSimulation",
    ]);
  });
});

describe("package manifests", () => {
  it("alfquote points types at shipped declarations and exposes the phase1 subpath", () => {
    const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
      name: string;
      exports: Record<string, Record<string, string>>;
    };
    expect(pkg.name).toBe("alfquote");
    expect(pkg.exports["."]).toEqual({
      types: "./dist/index.d.ts",
      import: "./dist/index.js",
      default: "./dist/index.js",
    });
    expect(pkg.exports["./phase1"]).toEqual({
      types: "./dist/phase1.d.ts",
      import: "./dist/phase1.js",
      default: "./dist/phase1.js",
    });
  });

  it("cli points types at shipped declarations", () => {
    const pkg = JSON.parse(
      readFileSync(new URL("../../../cli/package.json", import.meta.url), "utf8"),
    ) as { exports: Record<string, Record<string, string>> };
    expect(pkg.exports["."]).toEqual({ types: "./dist/main.d.ts", import: "./dist/main.js" });
  });
});

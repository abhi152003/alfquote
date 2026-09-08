/** Surface owners: assessment (WO-11), quote (WO-12), swap (WO-13), discovery (WO-10). */
import { describe, expect, it } from "vitest";
import * as assessment from "../../src/assessment.js";
import * as quote from "../../src/quote.js";
import * as swap from "../../src/swap.js";
import * as discovery from "../../src/discovery.js";
import * as hookChecks from "../../src/hookChecks.js";
import { HOOK_ASSESSMENT_KEYS } from "../../src/index.js";

describe("surface: assessment.js (WO-11 owns)", () => {
  it("exports exactly the assessment-dimension registry", () => {
    expect(Object.keys(assessment).sort()).toEqual(["HOOK_ASSESSMENT_KEYS"]);
  });

  it("stays four independent dimensions with no combined verdict", () => {
    expect([...HOOK_ASSESSMENT_KEYS]).toEqual([
      "compatibility",
      "provenance",
      "routing",
      "upgradeability",
    ]);
  });
});

describe("surface: quote.js (WO-12 owns)", () => {
  it("currently exports types only; the quote service adds values here", () => {
    expect(Object.keys(quote).sort()).toEqual([]);
  });
});

describe("surface: swap.js (WO-13 owns)", () => {
  it("currently exports types only; the swap service adds values here", () => {
    expect(Object.keys(swap).sort()).toEqual([]);
  });
});

describe("surface: discovery.js + hookChecks.js (WO-10 owns)", () => {
  it("exports exactly the factory and provenance read helpers", () => {
    expect(Object.keys(discovery).sort()).toEqual([
      "enumerateDeployments",
      "factoryProvenance",
      "hasBytecode",
    ]);
    expect(Object.keys(hookChecks).sort()).toEqual(["reverseProvenance", "supportsInterface"]);
  });
});

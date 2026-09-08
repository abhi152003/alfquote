/** Surface owner: structured assessment (WO-11). */
import { describe, expect, it } from "vitest";
import * as assessment from "../../src/assessment.js";
import { HOOK_ASSESSMENT_KEYS } from "../../src/index.js";

describe("surface: assessment.js (WO-11 owns)", () => {
  it("exports exactly the dimension registry, service, and proxy constants", () => {
    expect(Object.keys(assessment).sort()).toEqual([
      "ASSESS_ERROR_CODES",
      "ASSESS_WARNING_CODES",
      "DYNAMIC_FEE_FLAG",
      "EIP1167_PREFIX",
      "EIP1967_SLOTS",
      "HOOK_ASSESSMENT_KEYS",
      "WETH",
      "assessHook",
    ]);
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

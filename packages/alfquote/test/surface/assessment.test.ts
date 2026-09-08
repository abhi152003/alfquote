/** Surface owner: structured assessment (WO-11). */
import { describe, expect, it } from "vitest";
import * as assessment from "../../src/assessment.js";
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

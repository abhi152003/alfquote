/** Surface owner: discovery service and codes (WO-10). */
import { describe, expect, it } from "vitest";
import * as discovery from "../../src/discovery.js";
import * as hookChecks from "../../src/hookChecks.js";

describe("surface: discovery.js (WO-10 owns)", () => {
  it("exports exactly the registry reads, service functions, and code registries", () => {
    expect(Object.keys(discovery).sort()).toEqual([
      "DISCOVER_ERROR_CODES",
      "DISCOVER_WARNING_CODES",
      "discoverFactoryHooks",
      "discoverHookPools",
      "enumerateDeployments",
      "factoryProvenance",
      "hasBytecode",
    ]);
  });
});

describe("surface: hookChecks.js (WO-10 owns)", () => {
  it("exports exactly the reverse-provenance and ERC-165 helpers", () => {
    expect(Object.keys(hookChecks).sort()).toEqual(["reverseProvenance", "supportsInterface"]);
  });
});

/** Surface owner: generic swap planning and simulation (WO-13). */
import { describe, expect, it } from "vitest";
import * as swap from "../../src/swap.js";

describe("surface: swap.js (WO-13 owns)", () => {
  it("exports exactly the swap service and its code registries", () => {
    expect(Object.keys(swap).sort()).toEqual([
      "SWAP_ERROR_CODES",
      "SWAP_WARNING_CODES",
      "planProtectedSwap",
      "simulateProtectedSwap",
    ]);
  });
});

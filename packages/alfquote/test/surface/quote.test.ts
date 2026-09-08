/** Surface owner: generic quote service (WO-12). */
import { describe, expect, it } from "vitest";
import * as quote from "../../src/quote.js";

describe("surface: quote.js (WO-12 owns)", () => {
  it("exports exactly the quote service and its code registries", () => {
    expect(Object.keys(quote).sort()).toEqual([
      "QUOTE_ERROR_CODES",
      "QUOTE_WARNING_CODES",
      "quoteExactIn",
      "quoteSwapToPrice",
    ]);
  });
});

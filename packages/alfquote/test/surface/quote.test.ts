/** Surface owner: generic quote service (WO-12). */
import { describe, expect, it } from "vitest";
import * as quote from "../../src/quote.js";

describe("surface: quote.js (WO-12 owns)", () => {
  it("currently exports types only; the quote service adds values here", () => {
    expect(Object.keys(quote).sort()).toEqual([]);
  });
});

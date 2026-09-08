import { describe, expect, it } from "vitest";
import {
  AMOUNT_ENV_VAR,
  BLOCK_ENV_VAR,
  DEFAULT_AMOUNT_USDC,
  RunOptionsError,
  loadRunOptions,
} from "../runOptions.js";

describe("loadRunOptions", () => {
  it("defaults to 100 USDC and no block", () => {
    expect(loadRunOptions({})).toEqual({ amountUsdc: DEFAULT_AMOUNT_USDC, blockNumber: undefined });
  });

  it("reads amount and block from env", () => {
    expect(
      loadRunOptions({ [AMOUNT_ENV_VAR]: "5", [BLOCK_ENV_VAR]: "25925049" }),
    ).toEqual({ amountUsdc: 5n, blockNumber: 25925049n });
  });

  it("lets argv override env", () => {
    expect(
      loadRunOptions({ [AMOUNT_ENV_VAR]: "100", [BLOCK_ENV_VAR]: "1" }, ["--amount", "1", "--block", "9"]),
    ).toEqual({ amountUsdc: 1n, blockNumber: 9n });
  });

  it("rejects zero or non-integer values", () => {
    expect(() => loadRunOptions({ [AMOUNT_ENV_VAR]: "0" })).toThrow(RunOptionsError);
    expect(() => loadRunOptions({ [BLOCK_ENV_VAR]: "latest" })).toThrow(RunOptionsError);
    expect(() => loadRunOptions({}, ["--amount", "-1"])).toThrow(RunOptionsError);
  });
});

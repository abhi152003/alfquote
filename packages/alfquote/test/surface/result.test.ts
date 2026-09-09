/** Surface owner: result envelopes, codes, and canonical serialization (WO-9 contracts). */
import { describe, expect, it } from "vitest";
import * as result from "../../src/result.js";
import * as codes from "../../src/codes.js";
import * as serialize from "../../src/serialize.js";
import {
  COMMON_ERROR_CODES,
  RESULT_SCHEMA_VERSION,
  errorMessage,
  errorResult,
  isNamespacedCode,
  isOkResult,
  isSkipResult,
  isErrorResult,
  okResult,
  serializeResult,
  skipResult,
  toJsonValue,
} from "../../src/index.js";

describe("surface: result.js", () => {
  it("exports exactly the pinned constructors and guards", () => {
    expect(Object.keys(result).sort()).toEqual([
      "RESULT_SCHEMA_VERSION",
      "errorMessage",
      "errorResult",
      "isErrorResult",
      "isOkResult",
      "isSkipResult",
      "okResult",
      "skipResult",
    ]);
  });
});

describe("surface: codes.js", () => {
  it("exports exactly the shared registries and the validator", () => {
    expect(Object.keys(codes).sort()).toEqual(["COMMON_ERROR_CODES", "isNamespacedCode"]);
  });

  it("accepts only namespaced domain/reason spellings", () => {
    for (const code of COMMON_ERROR_CODES) expect(isNamespacedCode(code)).toBe(true);
    expect(isNamespacedCode("plain")).toBe(false);
    expect(isNamespacedCode("NoCase/Here")).toBe(false);
    expect(isNamespacedCode("a//b")).toBe(false);
  });
});

describe("surface: serialize.js", () => {
  it("exports exactly the canonical serializer pair", () => {
    expect(Object.keys(serialize).sort()).toEqual(["serializeResult", "toJsonValue"]);
  });

  const chain = { chainId: 1, blockNumber: 25_933_348n, blockSource: "pinned" as const };

  it("errorMessage redacts userinfo credentials when the caller supplies its RPC URL", () => {
    const url = "https://alchemy-key:hunter2@eth-mainnet.g.alchemy.com/v2/op0123456789";
    const message = errorMessage(new Error(`connect failed for ${url} and again ${url}`), [url]);
    expect(message).not.toContain("hunter2");
    expect(message).not.toContain("alchemy-key");
    expect(message).toContain("***");
  });

  it("serializes bigint fields as decimal strings and round-trips through JSON.parse", () => {
    const ok = okResult("quote", chain, { poolId: "0xabc", amount: 1_000_000n }, { out: 995_193n });
    const text = serializeResult(ok);
    const parsed: { chain: { blockNumber: string }; input: { amount: string }; data: { out: string } } =
      JSON.parse(text);
    expect(parsed.chain.blockNumber).toBe("25933348");
    expect(parsed.input.amount).toBe("1000000");
    expect(parsed.data.out).toBe("995193");
    expect(JSON.parse(text)).toEqual(parsed); // canonical: re-parsing is stable
  });

  it("serializes every result status, drops undefined, and throws on non-representable values", () => {
    const skip = skipResult("quote", chain, {}, { code: "quote/zero-output", message: "zero" });
    const err = errorResult("swap", chain, {}, { code: "rpc/read-failed", message: "boom" });
    expect(() => JSON.parse(serializeResult(skip))).not.toThrow();
    expect(() => JSON.parse(serializeResult(err))).not.toThrow();
    expect("skipped" in JSON.parse(serializeResult(err))).toBe(false);
    expect(toJsonValue([1n, undefined, "x"])).toEqual(["1", null, "x"]);
    expect(toJsonValue(Object.assign(Object.create(null), { a: 1n }))).toEqual({ a: "1" });
    expect(() => toJsonValue({ f: () => 1 })).toThrow(TypeError);
    expect(() => toJsonValue(new Map())).toThrow(TypeError);
  });

  it("envelope smoke: constructors stamp schema version and discriminate status", () => {
    const input = { poolId: "0xabc" };
    const ok = okResult("quote", chain, input, { out: 1n }, [{ code: "quote/view-drift", message: "m" }]);
    const err = errorResult("quote", chain, input, { code: "rpc/read-failed", message: "boom" });
    expect(ok.schemaVersion).toBe(RESULT_SCHEMA_VERSION);
    expect(ok.warnings[0]?.code).toBe("quote/view-drift");
    expect(isOkResult(ok) && ok.data).toEqual({ out: 1n });
    expect(isSkipResult(skipResult("quote", chain, input, { code: "quote/zero-output", message: "z" }))).toBe(true);
    expect(isErrorResult(err)).toBe(true);
  });
});

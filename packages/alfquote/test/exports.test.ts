import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import * as alfquote from "../src/index.js";
import {
  RESULT_SCHEMA_VERSION,
  errorResult,
  isErrorResult,
  isOkResult,
  isSkipResult,
  okResult,
  skipResult,
  type CommandResult,
} from "../src/index.js";

/**
 * The exact value-export allowlist of the public surface. Types are erased at
 * runtime, so this pins the runtime surface; the barrel review pins the rest.
 */
const EXPECTED_EXPORTS = [
  "ALLOWLISTED_FACTORY",
  "DEMO_POOL_INIT",
  "FACTORY_BIRTH_BLOCK",
  "FACTORY_REGISTRY_SNAPSHOT",
  "FIXTURE_HOOK",
  "FIXTURE_HOOK_BIRTH_BLOCK",
  "FIXTURE_POOL_ID",
  "HOOK_ASSESSMENT_KEYS",
  "IALFHOOK_INTERFACE_ID",
  "IALFHOOK_SOURCE_URL",
  "IHOOKSTATS_INTERFACE_ID",
  "IHOOKSTATS_SOURCE_URL",
  "LIQUIDITY_OFFSET",
  "NEAR_ZERO_VANILLA_LIQUIDITY",
  "PERMIT2",
  "PINNED_POOL_KEY",
  "POOL_MANAGER",
  "POOL_MANAGER_BIRTH_BLOCK",
  "POOLS_SLOT",
  "RESULT_SCHEMA_VERSION",
  "SETTLE_ALL",
  "SWAP_EXACT_IN_SINGLE",
  "TAKE_ALL",
  "UPSTREAM_SOURCE",
  "USDC",
  "USDT",
  "V4_CORE_REVISION",
  "V4_CORE_STATE_LIBRARY_URL",
  "V4_HOOKS_PUBLIC_REVISION",
  "V4_SWAP_COMMAND",
  "DEFAULT_SLIPPAGE_BPS",
  "UNIVERSAL_ROUTER",
  "alfHookAbi",
  "allowanceBlockers",
  "amountOutMinimumFromQuote",
  "classifyDecodedError",
  "decodeRevert",
  "decodeRevertData",
  "decodeV4ExactInSingleCalldata",
  "decodeVanillaLiquidity",
  "decideProof",
  "derivePoolId",
  "dualPoolHookViewsAbi",
  "encodeExecuteCalldata",
  "encodeV4ExactInSingleExecute",
  "erc165Abi",
  "erc20Abi",
  "erc20MetadataAbi",
  "errorResult",
  "factoryAbi",
  "factoryProvenance",
  "getIndicativeQuoteEncodedDiagnostic",
  "getIndicativeQuoteSafe",
  "hasBytecode",
  "hookStatsAbi",
  "enumerateDeployments",
  "interfaceIdOf",
  "isErrorResult",
  "isOkResult",
  "isSkipResult",
  "maskRpcUrl",
  "okResult",
  "permit2Abi",
  "poolManagerAbi",
  "poolStateSlot",
  "quoteFillGapBps",
  "readErc20Info",
  "readHookStats",
  "readLiveness",
  "readMaxGas",
  "readSwapAllowances",
  "readVanillaLiquidity",
  "redactKeys",
  "redactRpcSecrets",
  "reverseProvenance",
  "runProtectedSimulation",
  "simulateUniversalRouterExecute",
  "skipResult",
  "supportsInterface",
  "universalRouterAbi",
].sort();

describe("alfquote public surface", () => {
  it("exports exactly the pinned allowlist", () => {
    expect(Object.keys(alfquote).sort()).toEqual([...EXPECTED_EXPORTS].sort());
  });

  it("package.json exposes a single typed entry point", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
      name: string;
      exports: Record<string, Record<string, string>>;
    };
    expect(pkg.name).toBe("alfquote");
    expect(pkg.exports["."]).toEqual({
      types: "./src/index.ts",
      import: "./dist/index.js",
      default: "./dist/index.js",
    });
  });
});

describe("result envelopes", () => {
  const chain = { chainId: 1, blockNumber: 25_933_348n, blockSource: "pinned" as const };

  it("ok/skip/error constructors stamp the schema version and discriminate status", () => {
    const input = { poolId: "0xabc" };
    const ok = okResult("quote", chain, input, { out: 1n });
    const skip = skipResult("quote", chain, input, { code: "quote/zero-output", message: "zero" });
    const err = errorResult("quote", chain, input, { code: "rpc/read-failed", message: "boom" });
    for (const result of [ok, skip, err] as CommandResult<unknown, typeof input>[]) {
      expect(result.schemaVersion).toBe(RESULT_SCHEMA_VERSION);
      expect(result.command).toBe("quote");
      expect(result.chain).toEqual(chain);
      expect(result.input).toBe(input);
      expect(result.warnings).toEqual([]);
    }
    expect(isOkResult(ok) && ok.data).toEqual({ out: 1n });
    expect(isSkipResult(skip) && skip.skipped.code).toBe("quote/zero-output");
    expect(isErrorResult(err) && err.error.code).toBe("rpc/read-failed");
    expect(isOkResult(skip)).toBe(false);
    expect(isErrorResult(ok)).toBe(false);
  });

  it("warnings ride along without changing status", () => {
    const ok = okResult("assess", chain, { hook: "0x1" }, null, [
      { code: "assess/proxy-unverified", message: "evidence incomplete" },
    ]);
    expect(isOkResult(ok)).toBe(true);
    expect(ok.warnings[0]?.code).toBe("assess/proxy-unverified");
  });
});

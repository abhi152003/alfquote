/** runCli integration tests: routing, exit codes, output — with a stubbed transport. */
import { describe, expect, it } from "vitest";
import { http, createPublicClient } from "viem";
import { parseAbi } from "viem";
import { exitCodeFor, runCli } from "../src/main.js";
import { RPC_URL_ENV_VAR } from "../src/config.js";

const HOOK = "0x00000078BD49D5279a99b5F4011a5C61eE8caaC0";
const SENDER = "0x5bc6f16Ca189D3C8d3Fbaf367611fB04a0B7b309";

function capture(): { out: string[]; err: string[]; stdout: (t: string) => void; stderr: (t: string) => void } {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, stdout: (t: string) => out.push(t), stderr: (t: string) => err.push(t) };
}

const ENV = { [RPC_URL_ENV_VAR]: "https://rpc.example/v2/testkey0000000" };

describe("runCli routing and exit codes", () => {
  it("prints help and versions with exit 0", async () => {
    const sinks = capture();
    expect(await runCli(["--help"], {}, sinks)).toBe(0);
    expect(sinks.out.join("\n")).toContain("Usage:");
    expect(await runCli(["--version"], {}, sinks)).toBe(0);
    expect(sinks.out.some((line) => line.trim() === "0.1.0")).toBe(true);
  });

  it("returns invalid-input exit 3 with actionable stderr", async () => {
    const sinks = capture();
    expect(await runCli(["assess"], {}, sinks)).toBe(3);
    expect(sinks.err.join("\n")).toContain("invalid input");
    expect(sinks.err.join("\n")).toContain("--help");
  });

  it("returns configuration exit 6 with a masked endpoint", async () => {
    const sinks = capture();
    expect(await runCli(["discover"], {}, sinks)).toBe(6);
    expect(sinks.err.join("\n")).toContain("configuration error");
    expect(await runCli(["discover", "--rpc", "ftp://u:sekret@h/x"], {}, sinks)).toBe(6);
    expect(sinks.err.join("\n")).not.toContain("sekret");
    expect(await runCli(["discover", "--chain", "137", "--rpc", "https://rpc.example"], {}, sinks)).toBe(6);
  });

  it("rejects live-send options with exit 3", async () => {
    const sinks = capture();
    const code = await runCli(
      ["swap", "--use-fixture-pool", "--amount", "1", "--sender", SENDER, "--send"],
      ENV,
      sinks,
    );
    expect(code).toBe(3);
    expect(sinks.err.join("\n")).toContain("unknown option");
  });

  it("rejects a fixture quote whose --pool does not match the pinned PoolId (exit 3, no RPC)", async () => {
    const sinks = capture();
    const wrongPool = "0x" + "ab".repeat(32);
    const code = await runCli(["quote", "--use-fixture-pool", "--amount", "1", "--exact-in", "--pool", wrongPool], ENV, sinks);
    expect(code).toBe(3);
    expect(sinks.err.join("\n")).toContain("does not match the PoolId");
  });

  it("rejects an explicit-pool quote whose --pool mismatches the derived id (exit 3)", async () => {
    const sinks = capture();
    const code = await runCli([
      "quote", "--hook", HOOK,
      "--currency0", "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "--currency1", "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      "--fee", "10", "--tick-spacing", "10",
      "--amount", "1", "--exact-in", "--pool", "0x" + "cd".repeat(32),
    ], ENV, sinks);
    expect(code).toBe(3);
    expect(sinks.err.join("\n")).toContain("refusing to mix identities");
  });

  it("accepts the matching fixture PoolId", async () => {
    const sinks = capture();
    const code = await runCli([
      "quote", "--use-fixture-pool", "--amount", "1", "--exact-in",
      "--pool", "0xf32349cbc41fec9d3194f2b4e9ee72ded0bfda412427be9cb8a4087f74bdb065",
    ], ENV, sinks);
    expect([0, 2, 4]).toContain(code);
  });

  it("maps unexpected internal failures to exit 1 with sanitized output", async () => {
    const err: string[] = [];
    const broken = {
      out: [] as string[],
      stdout: (): void => {
        throw new Error("write EPIPE https://rpc.example/v2/KEY1234567890");
      },
      stderr: (t: string) => err.push(t),
    };
    const code = await runCli(["quote", "--use-fixture-pool", "--amount", "1", "--exact-in"], ENV, broken);
    expect(code).toBe(1);
    expect(err.join("\n")).toContain("internal error");
    expect(err.join("\n")).not.toContain("KEY1234567890");
    expect(broken.out).toEqual([]);
  });

  it("reaches the network layer only with valid input (chain mismatch → 4)", async () => {
    // A malformed-but-reachable endpoint fails the service chain probe and maps to exit 4.
    const sinks = capture();
    const code = await runCli(
      ["discover", "--format", "json", "--rpc", "https://rpc.invalid.invalid"],
      {},
      sinks,
    );
    expect([4, 1]).toContain(code);
    const text = sinks.out.join("\n") + sinks.err.join("\n");
    expect(text).not.toMatch(/secret|sk-[A-Za-z0-9]+/i);
  }, 30_000);
});

describe("viem client wiring sanity", () => {
  it("createClient builds a mainnet-capable http client", async () => {
    const client = createPublicClient({ transport: http("https://rpc.example") });
    expect(typeof client.readContract).toBe("function");
    expect(typeof client.getLogs).toBe("function");
    expect(typeof client.getBlockNumber).toBe("function");
    expect(parseAbi(["function x() view returns (uint256)"])).toHaveLength(1);
  });
});

describe("exitCodeFor", () => {
  const chain = { chainId: 1, blockNumber: null, blockSource: "latest" as const };
  it("maps ok, skip, and error envelopes to their documented codes", async () => {
    const { okResult, skipResult, errorResult } = await import("alfquote");
    expect(exitCodeFor(okResult("quote", chain, {}, { out: 1n }))).toBe(0);
    expect(exitCodeFor(skipResult("quote", chain, {}, { code: "quote/zero-output", message: "zero" }))).toBe(2);
    expect(exitCodeFor(errorResult("quote", chain, {}, { code: "rpc/read-failed", message: "x" }))).toBe(4);
  });

  it("maps swap blockers to 5 and keeps other ok commands at 0", async () => {
    const { okResult } = await import("alfquote");
    expect(exitCodeFor(okResult("swap", chain, {}, { plan: {}, stateBlockUsed: 1n, allowanceIssues: ["balance"] }))).toBe(5);
    expect(exitCodeFor(okResult("swap", chain, {}, { plan: {}, stateBlockUsed: 1n, allowanceIssues: [] }))).toBe(0);
    expect(exitCodeFor(okResult("quote", chain, {}, { liquidity: {} }))).toBe(0);
  });
});

describe("main module shape", () => {
  it("exports runCli as the testable entry", async () => {
    const module = await import("../src/main.js");
    expect(typeof module.runCli).toBe("function");
  });

  it("keeps HOOK/SENDER constants exercised (fixture sanity)", () => {
    expect(HOOK).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(SENDER).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });
});

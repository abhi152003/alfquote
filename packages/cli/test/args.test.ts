/** Parser tests: valid assembly, defaults, fail-closed validation, help/version flows. */
import { describe, expect, it } from "vitest";
import { ArgsError, parseArgs } from "../src/args.js";
import type { ParseSinks } from "../src/args.js";

const capture = (): ParseSinks & { out: string[]; err: string[] } => {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, stdout: (t) => out.push(t), stderr: (t) => err.push(t) };
};

const HOOK = "0x00000078BD49D5279a99b5F4011a5C61eE8caaC0";
const POOL = "0xf32349cbc41fec9d3194f2b4e9ee72ded0bfda412427be9cb8a4087f74bdb065";

describe("parseArgs", () => {
  it("parses discover with defaults", () => {
    const parsed = parseArgs(["discover"]);
    expect(parsed).toMatchObject({ command: "discover", format: "human", chain: 1, fixtures: [] });
  });

  it("parses global options and repeatable fixtures", () => {
    const parsed = parseArgs(["discover", "--format", "json", "--block", "25930000", "--chain", "1", "--fixture", HOOK]);
    expect(parsed).toMatchObject({
      command: "discover",
      format: "json",
      block: 25_930_000n,
      chain: 1,
      fixtures: [HOOK],
    });
  });

  it("parses pool scans with an explicit range", () => {
    const parsed = parseArgs(["discover", "--pools-for", HOOK, "--from-block", "25540380", "--to-block", "25540390"]);
    expect(parsed).toMatchObject({ command: "discover", poolsFor: HOOK, fromBlock: 25_540_380n, toBlock: 25_540_390n });
  });

  it("parses assess with pool context and the fixture flag", () => {
    const parsed = parseArgs(["assess", "--hook", HOOK, "--pool", POOL, "--fixture", "--use-fixture-pool"]);
    expect(parsed).toMatchObject({ command: "assess", hook: HOOK, pool: POOL, fixture: true, useFixturePool: true });
  });

  it("parses the fixture quote with an explicit direction and a reversed default", () => {
    const explicit = parseArgs(["quote", "--use-fixture-pool", "--amount", "1.5", "--exact-in", "--zero-for-one"]);
    expect(explicit).toMatchObject({ command: "quote", amount: "1.5", decimals: 6, exactIn: true, zeroForOne: true, pool: { useFixturePool: true } });
    const reversed = parseArgs(["quote", "--use-fixture-pool", "--amount", "1", "--exact-in", "--one-for-zero"]);
    expect(reversed).toMatchObject({ zeroForOne: false });
    const defaulted = parseArgs(["quote", "--use-fixture-pool", "--amount", "1", "--exact-in"]);
    expect(defaulted).toMatchObject({ zeroForOne: true });
    expect(() => parseArgs(["quote", "--use-fixture-pool", "--amount", "1", "--exact-in", "--zero-for-one", "--one-for-zero"])).toThrow(/not both/);
  });

  it("parses an explicit pool quote", () => {
    const parsed = parseArgs([
      "quote", "--hook", HOOK, "--currency0", "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "--currency1", "0xdAC17F958D2ee523a2206206994597C13D831ec7", "--fee", "10", "--tick-spacing", "10",
      "--amount", "1", "--exact-in",
    ]);
    expect(parsed).toMatchObject({
      command: "quote",
      pool: { hook: HOOK, fee: 10, tickSpacing: 10, useFixturePool: false },
    });
  });

  it("parses the dry-run swap and rejects live-send options", () => {
    const parsed = parseArgs(["swap", "--use-fixture-pool", "--amount", "1", "--slippage-bps", "50", "--sender", "0x5bc6f16Ca189D3C8d3Fbaf367611fB04a0B7b309", "--dry-run"]);
    expect(parsed).toMatchObject({ command: "swap", dryRun: true, slippageBps: 50 });
    for (const banned of ["--send", "--live", "--broadcast"]) {
      expect(() => parseArgs(["swap", "--use-fixture-pool", "--amount", "1", "--sender", "0x5bc6f16Ca189D3C8d3Fbaf367611fB04a0B7b309", banned])).toThrow(ArgsError);
    }
  });

  it("rejects invalid values with actionable messages", () => {
    expect(() => parseArgs(["assess", "--hook", "0x123"])).toThrow(ArgsError);
    expect(() => parseArgs(["assess", "--hook", HOOK, "--pool", "0xabc"])).toThrow(/PoolId/);
    expect(() => parseArgs(["discover", "--format", "xml"])).toThrow(/--format/);
    expect(() => parseArgs(["quote", "--use-fixture-pool", "--amount", "0", "--exact-in"])).toThrow(/--amount/);
    expect(() => parseArgs(["swap", "--use-fixture-pool", "--amount", "1", "--sender", "0x5bc6f16Ca189D3C8d3Fbaf367611fB04a0B7b309", "--slippage-bps", "10000"])).toThrow(/slippage/);
    expect(() => parseArgs(["discover", "--nope"])).toThrow(ArgsError);
    expect(() => parseArgs(["frobnicate"])).toThrow(ArgsError);
    expect(() => parseArgs(["discover", "--from-block", "1"])).toThrow(/--pools-for/);
    expect(() => parseArgs(["discover", "--pools-for", HOOK])).toThrow(/--from-block/);
    expect(() => parseArgs(["discover", "--pools-for", HOOK, "--from-block", "1", "--fixture", HOOK])).toThrow(/ignored by pool scans/);
    expect(() => parseArgs(["discover", "--pools-for", HOOK, "--from-block", "1", "--block", "5"])).toThrow(/not used by pool scans/);
    expect(() => parseArgs(["quote", "--amount", "1", "--exact-in"])).toThrow(/pool context/);
    expect(() => parseArgs(["quote", "--use-fixture-pool", "--hook", HOOK, "--amount", "1", "--exact-in"])).toThrow(/not both/);
  });

  it("routes help and version through the sinks", () => {
    const sinks = capture();
    expect(parseArgs(["--help"], sinks)).toEqual({ command: "help", topic: "root" });
    expect(sinks.out.join("\n")).toContain("Examples:");
    expect(sinks.out.join("\n")).toContain("Exit codes:");
    expect(parseArgs(["discover", "--help"], sinks)).toEqual({ command: "help", topic: "discover" });
    expect(sinks.out.join("\n")).toContain("alfquote discover --chain 1 --format json");
    expect(parseArgs(["--version"], sinks)).toEqual({ command: "version" });
    expect(sinks.out.some((line) => line.trim() === "0.1.0")).toBe(true);
    const bare = capture();
    expect(parseArgs([], bare)).toEqual({ command: "help", topic: "root" });
    expect(bare.out.join("\n")).toContain("Usage:");
    expect(bare.err).toEqual([]);
  });

  it("keeps every command help page example working-shaped", () => {
    const sinks = capture();
    for (const command of ["discover", "assess", "quote", "swap"] as const) {
      parseArgs([command, "--help"], sinks);
      const page = sinks.out.join("\n");
      expect(page).toContain(`alfquote ${command}`);
      expect(page).toMatch(/Examples?:/);
      sinks.out.length = 0;
    }
  });
});

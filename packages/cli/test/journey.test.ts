/**
 * WO-15 offline end-to-end journey: discover → assess → quote → swap dry-run through
 * runCli in both output formats, from one mocked transport. Verifies the documented
 * exit codes, factory-vs-fixture distinction, preserved warnings, and JSON/human parity.
 */
import { describe, expect, it } from "vitest";
import { encodeAbiParameters } from "viem";
import type { Address, Hex } from "viem";
import { ALLOWLISTED_FACTORY, POOL_MANAGER } from "alfquote";
import { FIXTURE_HOOK, FIXTURE_POOL_ID, PINNED_POOL_KEY } from "alfquote/phase1";
import { LIQUIDITY_OFFSET, poolStateSlot } from "alfquote";
import { runCli } from "../src/main.js";
import { fakeClient } from "./mockClient.js";

const SENDER: Address = "0x5bc6f16Ca189D3C8d3Fbaf367611fB04a0B7b309";
const REGISTRY_HOOK: Address = "0x0000005bb4DF4109bF356a585C8b8Ea70FCbAaC0";
const QUOTED_OUT = 1_000_012n;
const AMOUNT_RAW = 1_000_000n;
const ZERO_WORD = `0x${"0".repeat(64)}`;

function journeyRoutes() {
  const stateSlot = poolStateSlot(FIXTURE_POOL_ID);
  const liquiditySlot = `0x${(BigInt(stateSlot) + LIQUIDITY_OFFSET).toString(16).padStart(64, "0")}`;
  const h = FIXTURE_HOOK.toLowerCase();
  const r = REGISTRY_HOOK.toLowerCase();
  const f = ALLOWLISTED_FACTORY.toLowerCase();
  const keyJson = JSON.stringify(PINNED_POOL_KEY);
  const p2 = PERMIT2_ROUTE_KEYS();
  return {
    head: 25_934_000n,
    code: {
      [f]: "0x6001",
      [h]: "0x6002",
      [r]: "0x6003",
    },
    reads: {
      // discovery
      [`${f}.allDeploymentsLength()`]: 1n,
      [`${f}.allDeployments(0)`]: REGISTRY_HOOK,
      [`${f}.isFromFactory(${REGISTRY_HOOK})`]: true,
      [`${f}.creationCodeHashOf(${REGISTRY_HOOK})`]: "0x" + "ab".repeat(32),
      [`${r}.factory()`]: ALLOWLISTED_FACTORY,
      // assessment + quote surface
      [`${h}.supportsInterface(0x01ffc9a7)`]: true,
      [`${h}.supportsInterface(0x7adbfbb8)`]: true,
      [`${h}.maxGas()`]: 800_000n,
      [`${h}.isLive()`]: true,
      [`${h}.livePools(${FIXTURE_POOL_ID})`]: true,
      [`${h}.factory()`]: "0x1111111111111111111111111111111111111111",
      [`${h}.getReserves(${keyJson})`]: [878_531_978n, 128_008_283n],
      [`${h}.getEffectiveLiquidity(${keyJson})`]: [878_531_978n, 128_008_283n],
      [`${POOL_MANAGER.toLowerCase()}.extsload(${stateSlot})`]: ZERO_WORD,
      [`${POOL_MANAGER.toLowerCase()}.extsload(${liquiditySlot})`]: ZERO_WORD,
      // tokens
      [`${PINNED_POOL_KEY.currency0.toLowerCase()}.decimals()`]: 6,
      [`${PINNED_POOL_KEY.currency0.toLowerCase()}.symbol()`]: "USDC",
      [`${PINNED_POOL_KEY.currency1.toLowerCase()}.decimals()`]: 6,
      [`${PINNED_POOL_KEY.currency1.toLowerCase()}.symbol()`]: "USDT",
      // allowances (swap): zero everything so blockers fire deterministically
      ...p2.reads,
    },
    call: () => ({
      data: encodeAbiParameters([{ name: "out", type: "uint256" }], [QUOTED_OUT]),
    }),
    estimateGas: new Error("execution reverted: AllowanceExpired"),
  };
}

function PERMIT2_ROUTE_KEYS() {
  const token = PINNED_POOL_KEY.currency0;
  const permit2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3".toLowerCase();
  return {
    reads: {
      [`${token.toLowerCase()}.balanceOf(${SENDER})`]: 0n,
      [`${token.toLowerCase()}.allowance(${SENDER})`]: 0n,
      [`${permit2}.allowance(${SENDER})`]: [0n, 0n, 0n],
    },
  };
}

function sinks(): { out: string[]; err: string[]; stdout: (t: string) => void; stderr: (t: string) => void } {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, stdout: (t) => out.push(t), stderr: (t) => err.push(t) };
}

const ENV = { ETHEREUM_RPC_URL: "https://rpc.example/v2/journeykey00000" };

async function run(argv: string[], mocked = fakeClient(journeyRoutes())): Promise<{ code: number; out: string; err: string; json: Record<string, unknown> | null }> {
  const s = sinks();
  const code = await runCli(argv, ENV, s, { client: mocked.client });
  const text = s.out.join("\n");
  let json: Record<string, unknown> | null = null;
  if (argv.includes("--format") && argv.includes("json")) {
    json = JSON.parse(text) as Record<string, unknown>;
  }
  return { code, out: text, err: s.err.join("\n"), json };
}

describe("offline CLI journey", () => {
  it("discover: exit 0, factory and fixture rows distinguished, envelope shape", async () => {
    const result = await run(["discover", "--format", "json", "--fixture", FIXTURE_HOOK]);
    expect(result.code).toBe(0);
    const data = (result.json!["data"] as { hooks: Array<{ address: string; provenance: string; registryIndex: number | null }> });
    const byProvenance = new Map(data.hooks.map((hook) => [hook.provenance, hook]));
    expect(byProvenance.get("factory")?.address.toLowerCase()).toBe(REGISTRY_HOOK.toLowerCase());
    expect(byProvenance.get("fixture")?.registryIndex).toBeNull();
    expect(result.json!["schemaVersion"]).toBe(1);
    expect(result.json!["command"]).toBe("discover");
  });

  it("assess: exit 0, four independent dimensions, no combined verdict", async () => {
    const result = await run(["assess", "--format", "json", "--hook", FIXTURE_HOOK, "--use-fixture-pool", "--fixture"]);
    expect(result.code).toBe(0);
    const data = result.json!["data"] as Record<string, unknown>;
    expect(Object.keys(data).sort()).toEqual(["compatibility", "provenance", "routing", "upgradeability"]);
    expect((data["provenance"] as { status: string }).status).toBe("fixture");
    expect("safe" in data).toBe(false);
  });

  it("quote: exit 0 with units, gas bound, liquidity signals, and preserved warnings", async () => {
    const result = await run(["quote", "--format", "json", "--use-fixture-pool", "--amount", "1", "--exact-in"]);
    expect(result.code).toBe(0);
    const data = result.json!["data"] as Record<string, unknown>;
    expect(data["amountInUnits"]).toBe("1");
    expect(data["outputAmountUnits"]).toBe("1.000012");
    expect(data["gasCap"]).toBe("800000");
    const warnings = (result.json!["warnings"] as Array<{ code: string }>).map((warning) => warning.code);
    expect(warnings).toContain("quote/non-binding");
    expect(warnings).toContain("quote/size-divergence");
  });

  it("swap dry-run: exit 5 with blockers, calldata, decoded revert, and no-send caveats", async () => {
    const result = await run([
      "swap", "--use-fixture-pool", "--amount", "1", "--slippage-bps", "50", "--sender", SENDER, "--dry-run",
      "--format", "json",
    ]);
    expect(result.code).toBe(5);
    const data = result.json!["data"] as Record<string, unknown>;
    expect((data["allowanceIssues"] as string[]).length).toBeGreaterThanOrEqual(3);
    const calldata = (data["plan"] as Record<string, unknown>)["calldata"] as string;
    expect(calldata).toMatch(/^0x3593564c/);
    expect(calldata.length).toBeGreaterThan(500); // render redaction must not truncate payload
    expect(data["revert"]).toBeDefined();
    const warnings = (result.json!["warnings"] as Array<{ code: string }>).map((warning) => warning.code);
    expect(warnings).toContain("swap/no-execution-certainty");
    expect(warnings).toContain("swap/allowance-blockers");
  });

  it("human output renders the same facts as JSON for every command", async () => {
    const discover = await run(["discover", "--fixture", FIXTURE_HOOK]);
    expect(discover.out).toContain("factory");
    expect(discover.out).toContain("fixture");

    const assess = await run(["assess", "--hook", FIXTURE_HOOK, "--use-fixture-pool", "--fixture"]);
    expect(assess.out).toContain("compatibility: supported");
    expect(assess.out).toContain("provenance: fixture");
    expect(assess.out).toContain("no combined verdict");

    const quote = await run(["quote", "--use-fixture-pool", "--amount", "1", "--exact-in"]);
    expect(quote.out).toContain("1 USDC → 1.000012 USDT");
    expect(quote.out).toContain("warnings:");
    expect(quote.out).toContain("quote/non-binding");
    expect(quote.out).toContain("size fills from effective");

    const swap = await run(["swap", "--use-fixture-pool", "--amount", "1", "--slippage-bps", "50", "--sender", SENDER, "--dry-run"]);
    expect(swap.code).toBe(5);
    expect(swap.out).toContain("calldata: 0x3593564c");
    expect(swap.out).toContain("blockers (fix these; they are never bypassed)");
    expect(swap.out).toContain("dry-run only");
    expect(swap.out).not.toContain("journeykey00000");
  });

  it("redacts the configured RPC URL from every output path", async () => {
    const leaky = fakeClient(journeyRoutes());
    const broken = Object.assign(leaky.client, {
      readContract: async () => {
        throw new Error("rpc dropped https://rpc.example/v2/journeykey00000");
      },
    });
    const s = sinks();
    const code = await runCli(["quote", "--use-fixture-pool", "--amount", "1", "--exact-in", "--format", "json"], ENV, s, { client: broken });
    expect(code).toBe(2);
    const text = s.out.join("\n");
    expect(text).toContain("/v2/***");
    expect(text).not.toContain("journeykey00000");
  });
});

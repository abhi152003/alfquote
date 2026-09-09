/** WO-10 discovery service tests: mock-client only, no state-changing RPC. */
import { describe, expect, it } from "vitest";
import { encodeAbiParameters, toEventSelector } from "viem";
import type { Address, Hex, PublicClient } from "viem";
import { DISCOVER_ERROR_CODES, discoverFactoryHooks, discoverHookPools } from "../src/discovery.js";
import { ALLOWLISTED_FACTORY, POOL_MANAGER } from "../src/addresses.js";
import { FIXTURE_POOL_ID, PINNED_POOL_KEY } from "../src/phase1.js";

const allowishZero = { key: PINNED_POOL_KEY, poolId: FIXTURE_POOL_ID };

interface MockLog {
  blockNumber: bigint | null;
  transactionHash: Hex | null;
  topics: readonly Hex[];
  data: Hex;
}

interface MockRoutes {
  chainId?: number;
  code?: Record<string, string>;
  reads?: Record<string, unknown>;
  logs?: MockLog[];
  getLogsError?: Error;
}

/** Route `eth_call`s by `${functionName}(${firstArg})` per address. */
function fakeClient(routes: MockRoutes): { client: PublicClient; calls: Array<Record<string, unknown>> } {
  const calls: Array<Record<string, unknown>> = [];
  const client = {
    getChainId: async () => routes.chainId ?? 1,
    getCode: async ({ address }: { address: Address }) => {
      calls.push({ method: "getCode", address });
      return routes.code?.[address.toLowerCase()] ?? "0x";
    },
    readContract: async (req: { address: Address; functionName: string; args?: readonly unknown[] }) => {
      calls.push(req);
      const key = `${req.address.toLowerCase()}.${req.functionName}(${(req.args ?? [])[0] ?? ""})`;
      const value = routes.reads?.[key];
      if (value instanceof Error) throw value;
      if (value === undefined) throw new Error(`unexpected read ${key}`);
      return value;
    },
    getLogs: async (req: Record<string, unknown>) => {
      calls.push({ method: "getLogs", ...req });
      if (routes.getLogsError) throw routes.getLogsError;
      return routes.logs ?? [];
    },
  } as unknown as PublicClient;
  return { client, calls };
}

const FACTORY = ALLOWLISTED_FACTORY;
const HOOK_A: Address = "0x0000000000077769C332e0D3ed8bC8E02A0cE108";
const HOOK_B: Address = "0x55BA643a0716988F2a7E7ff27Dc4c80BEa8a6ac0";
const CODE = "0x60019000";

/** Route keys are address-lowercase (as the mock builds them). */
function registryReads(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const f = FACTORY.toLowerCase();
  const a = HOOK_A.toLowerCase();
  return {
    [`${f}.allDeploymentsLength()`]: 1n,
    [`${f}.allDeployments(0)`]: HOOK_A,
    [`${f}.isFromFactory(${HOOK_A})`]: true,
    [`${f}.creationCodeHashOf(${HOOK_A})`]: "0x" + "ab".repeat(32),
    [`${a}.factory()`]: FACTORY,
    ...overrides,
  };
}

describe("discoverFactoryHooks", () => {
  it("errors when the client is not on Ethereum chain 1", async () => {
    const { client } = fakeClient({ chainId: 137, reads: registryReads() });
    const result = await discoverFactoryHooks(client, {});
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error.code).toBe("rpc/chain-mismatch");
      expect(result.chain.chainId).toBe(137);
    }
  });

  it("errors structurally when the chain-id probe itself fails", async () => {
    const { client } = fakeClient({ reads: registryReads() });
    const broken = Object.assign(client, {
      getChainId: async () => {
        throw new Error("endpoint down");
      },
    });
    const result = await discoverFactoryHooks(broken, {});
    expect(result.status).toBe("error");
    if (result.status === "error") expect(result.error.code).toBe("rpc/read-failed");
  });

  it("keeps all other results when one fixture bytecode read throws", async () => {
    const fixture: Address = "0x00000078BD49D5279a99b5F4011a5C61eE8caaC0";
    const base = fakeClient({
      code: { [FACTORY.toLowerCase()]: CODE },
      reads: registryReads(),
    });
    const throwing = {
      ...base.client,
      getCode: async ({ address }: { address: Address }) => {
        if (address.toLowerCase() === fixture.toLowerCase()) throw new Error("rate limited");
        return CODE;
      },
    } as typeof base.client;
    const result = await discoverFactoryHooks(throwing, { fixtures: [fixture] });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data.hooks).toHaveLength(1);
    expect(result.data.hooks[0]!.provenance).toBe("factory");
    expect(result.data.partialFailures).toEqual([
      { target: `fixture:${fixture}`, code: "discover/fixture-read-failed", message: "rate limited" },
    ]);
  });

  it("errors when the factory has no bytecode", async () => {
    const { client } = fakeClient({ code: {}, reads: registryReads() });
    const result = await discoverFactoryHooks(client, {});
    expect(result.status).toBe("error");
    if (result.status === "error") expect(result.error.code).toBe("discover/factory-read-failed");
  });

  it("errors when registry enumeration throws", async () => {
    const { client } = fakeClient({
      code: { [FACTORY.toLowerCase()]: CODE },
      reads: { [`${FACTORY.toLowerCase()}.allDeploymentsLength()`]: new Error("rpc down") },
    });
    const result = await discoverFactoryHooks(client, {});
    expect(result.status).toBe("error");
    if (result.status === "error") expect(result.error.code).toBe("discover/registry-read-failed");
  });

  it("labels two-way-verified registry hooks factory at the pinned block", async () => {
    const { client, calls } = fakeClient({ code: { [FACTORY.toLowerCase()]: CODE }, reads: registryReads() });
    const result = await discoverFactoryHooks(client, { blockNumber: 25_930_000n });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.chain).toEqual({ chainId: 1, blockNumber: 25_930_000n, blockSource: "pinned" });
    expect(result.data.hooks).toHaveLength(1);
    const hook = result.data.hooks[0]!;
    expect(hook.provenance).toBe("factory");
    expect(hook.registryIndex).toBe(0);
    expect(hook.block).toBe(25_930_000n);
    expect(hook.evidence).toEqual({
      isFromFactory: true,
      creationCodeHash: "0x" + "ab".repeat(32),
      hookReportedFactory: FACTORY,
      reverseMatches: true,
    });
    const provenanceCalls = calls.filter((call) => call.functionName === "isFromFactory");
    expect(provenanceCalls.every((call) => call.blockNumber === 25_930_000n)).toBe(true);
  });

  it("downgrades one-sided provenance to unknown with a warning", async () => {
    const { client } = fakeClient({
      code: { [FACTORY.toLowerCase()]: CODE },
      reads: registryReads({ [`${HOOK_A.toLowerCase()}.factory()`]: "0x1111111111111111111111111111111111111111" }),
    });
    const result = await discoverFactoryHooks(client, {});
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data.hooks[0]!.provenance).toBe("unknown");
    expect(result.warnings.map((warning) => warning.code)).toContain("discover/provenance-one-sided");
  });

  it("keeps a hook as unknown (never lost) when its provenance calls throw", async () => {
    const { client } = fakeClient({
      code: { [FACTORY.toLowerCase()]: CODE, [HOOK_A.toLowerCase()]: CODE },
      reads: registryReads({
        [`${FACTORY.toLowerCase()}.allDeploymentsLength()`]: 2n,
        [`${FACTORY.toLowerCase()}.allDeployments(1)`]: HOOK_B,
        [`${FACTORY.toLowerCase()}.isFromFactory(${HOOK_B})`]: new Error("revert"),
        [`${HOOK_B.toLowerCase()}.factory()`]: FACTORY,
      }),
    });
    const result = await discoverFactoryHooks(client, {});
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data.hooks).toHaveLength(2);
    expect(result.data.hooks[1]!.provenance).toBe("unknown");
    expect(result.data.hooks[1]!.evidence.isFromFactory).toBeNull();
    expect(result.data.partialFailures).toEqual([
      { target: `hook:${HOOK_B}`, code: "discover/hook-provenance-failed", message: "revert" },
    ]);
    expect(result.warnings.map((warning) => warning.code)).toContain("discover/partial-failures");
  });

  it("preserves the surviving half of provenance evidence when one read fails", async () => {
    const { client } = fakeClient({
      code: { [FACTORY.toLowerCase()]: CODE, [HOOK_A.toLowerCase()]: CODE },
      reads: registryReads({
        [`${FACTORY.toLowerCase()}.allDeploymentsLength()`]: 2n,
        [`${FACTORY.toLowerCase()}.allDeployments(1)`]: HOOK_B,
        [`${FACTORY.toLowerCase()}.isFromFactory(${HOOK_B})`]: new Error("forward failed"),
        [`${HOOK_B.toLowerCase()}.factory()`]: FACTORY,
      }),
    });
    const result = await discoverFactoryHooks(client, {});
    if (result.status !== "ok") throw new Error("expected ok");
    const hookB = result.data.hooks[1]!;
    expect(hookB.provenance).toBe("unknown");
    expect(hookB.evidence).toEqual({
      isFromFactory: null,
      creationCodeHash: null,
      hookReportedFactory: FACTORY,
      reverseMatches: true,
    });
    expect(result.data.partialFailures).toEqual([
      { target: `hook:${HOOK_B}`, code: "discover/hook-provenance-failed", message: "forward failed" },
    ]);
  });

  it("deduplicates a fixture that is also a registry deployment", async () => {
    const { client, calls } = fakeClient({
      code: { [FACTORY.toLowerCase()]: CODE },
      reads: registryReads({
        [`${FACTORY.toLowerCase()}.allDeployments(0)`]: HOOK_B,
        [`${FACTORY.toLowerCase()}.isFromFactory(${HOOK_B})`]: true,
        [`${FACTORY.toLowerCase()}.creationCodeHashOf(${HOOK_B})`]: "0x" + "ab".repeat(32),
        [`${HOOK_B.toLowerCase()}.factory()`]: FACTORY,
      }),
    });
    const result = await discoverFactoryHooks(client, { fixtures: [HOOK_B] });
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.data.hooks).toHaveLength(1);
    expect(result.data.hooks[0]!.provenance).toBe("factory");
    expect(result.data.hooks[0]!.registryIndex).toBe(0);
    expect(result.warnings.map((warning) => warning.code)).toContain("discover/fixture-also-registered");
    expect(calls.some((call) => call.method === "getCode" && call.address === HOOK_B)).toBe(false);
  });

  it("appends deployed fixtures labeled fixture with no factory calls", async () => {
    const fixture: Address = "0x00000078BD49D5279a99b5F4011a5C61eE8caaC0";
    const { client, calls } = fakeClient({
      code: { [FACTORY.toLowerCase()]: CODE, [fixture.toLowerCase()]: CODE },
      reads: registryReads(),
    });
    const result = await discoverFactoryHooks(client, { fixtures: [fixture] });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const labeled = result.data.hooks.find((hook) => hook.address.toLowerCase() === fixture.toLowerCase());
    expect(labeled).toMatchObject({ provenance: "fixture", registryIndex: null });
    const factoryArgs = calls
      .filter((call) => call.functionName === "isFromFactory")
      .map((call) => (call.args as readonly unknown[] | undefined) ?? []);
    expect(factoryArgs.some((args) => args[0] === fixture)).toBe(false);
  });

  it("records a partial failure for a fixture with no bytecode", async () => {
    const gone: Address = "0x000000000000000000000000000000000000dEaD";
    const { client } = fakeClient({
      code: { [FACTORY.toLowerCase()]: CODE },
      reads: registryReads(),
    });
    const result = await discoverFactoryHooks(client, { fixtures: [gone] });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data.hooks).toHaveLength(1);
    expect(result.data.partialFailures[0]!.code).toBe("discover/fixture-not-deployed");
  });

  it("treats an empty registry with no fixtures as a valid typed outcome", async () => {
    const { client } = fakeClient({
      code: { [FACTORY.toLowerCase()]: CODE },
      reads: registryReads({ [`${FACTORY.toLowerCase()}.allDeploymentsLength()`]: 0n }),
    });
    const result = await discoverFactoryHooks(client, {});
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.data.hooks).toEqual([]);
      expect(result.data.partialFailures).toEqual([]);
    }
  });
});

describe("discoverHookPools", () => {
  const ZERO_32 = `0x${"0".repeat(64)}` as Hex;

  function initializeLog(args: {
    id: Hex;
    currency0: Address;
    currency1: Address;
    fee: number;
    tickSpacing: number;
    hooks: Address;
  }): MockLog {
    const signature = toEventSelector(
      "Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)",
    );
    const pad = (value: Address): Hex => (`0x${"0".repeat(24)}${value.slice(2).toLowerCase()}`) as Hex;
    const data = encodeAbiParameters(
      [
        { name: "fee", type: "uint24" },
        { name: "tickSpacing", type: "int24" },
        { name: "hooks", type: "address" },
        { name: "sqrtPriceX96", type: "uint160" },
        { name: "tick", type: "int24" },
      ],
      [args.fee, args.tickSpacing, args.hooks, 2n ** 96n, 0],
    );
    return {
      blockNumber: 25_540_385n,
      transactionHash: "0x" + "tx".repeat(32) as Hex,
      topics: [signature, args.id, pad(args.currency0), pad(args.currency1)],
      data,
    };
  }

  it("reconstructs the exact PoolKey and verifies the derived PoolId", async () => {
    const { client, calls } = fakeClient({
      logs: [
        initializeLog({ ...allowishZero.key, id: allowishZero.poolId }),
        initializeLog({ ...allowishZero.key, hooks: "0x1111111111111111111111111111111111111111", id: ZERO_32 }),
      ],
    });
    const result = await discoverHookPools(client, {
      hook: allowishZero.key.hooks,
      fromBlock: 25_500_000n,
      toBlock: 25_600_000n,
    });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data.pools).toHaveLength(1);
    const pool = result.data.pools[0]!;
    expect(pool.poolKey).toEqual(allowishZero.key);
    expect(pool.poolKeyMatches).toBe(true);
    expect(pool.derivedPoolId).toBe(allowishZero.poolId);
    expect(pool.block).toBe(25_540_385n);
    const scan = calls.find((call) => call.method === "getLogs");
    expect(scan).toMatchObject({ address: POOL_MANAGER, fromBlock: 25_500_000n, toBlock: 25_600_000n });
  });

  it("turns malformed Initialize logs into partial failures and skips foreign events", async () => {
    const good = initializeLog({ ...allowishZero.key, id: allowishZero.poolId });
    const foreign = { ...good, topics: [`0x${"ff".repeat(32)}` as Hex, ...good.topics.slice(1)] };
    const { client } = fakeClient({
      logs: [
        { ...good, data: "0xdeadbeef" },
        good,
        { ...good, transactionHash: null },
        foreign,
      ],
    });
    const result = await discoverHookPools(client, { hook: allowishZero.key.hooks, fromBlock: 1n });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data.pools).toHaveLength(1);
    expect(result.data.partialFailures).toHaveLength(2);
    expect(result.data.partialFailures.every((failure) => failure.code === "discover/log-decode-failed")).toBe(true);
    expect(result.warnings.map((warning) => warning.code)).toContain("discover/partial-failures");
  });

  it("warns when a reconstructed PoolKey derives a mismatching PoolId", async () => {
    const wrongId = initializeLog({ ...allowishZero.key, id: ZERO_32 });
    const { client } = fakeClient({ logs: [wrongId] });
    const result = await discoverHookPools(client, { hook: allowishZero.key.hooks, fromBlock: 1n });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data.pools[0]!.poolKeyMatches).toBe(false);
    expect(result.warnings.map((warning) => warning.code)).toContain("discover/pool-id-mismatch");
  });

  it("errors when the log scan itself fails", async () => {
    const { client } = fakeClient({ getLogsError: new Error("node limit") });
    const result = await discoverHookPools(client, { hook: allowishZero.key.hooks, fromBlock: 1n });
    expect(result.status).toBe("error");
    if (result.status === "error") expect(result.error.code).toBe("discover/pool-scan-failed");
  });

  it("treats a scan with no matching pools as a valid typed outcome", async () => {
    const { client } = fakeClient({ logs: [] });
    const result = await discoverHookPools(client, { hook: allowishZero.key.hooks, fromBlock: 1n });
    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.data.pools).toEqual([]);
  });
});

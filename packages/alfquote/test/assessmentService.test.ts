/** WO-11 assessment service tests: mock-client only; every enum value covered. */
import { describe, expect, it } from "vitest";
import type { Address, Hex } from "viem";
import {
  ASSESS_ERROR_CODES,
  ASSESS_WARNING_CODES,
  EIP1167_PREFIX,
  EIP1967_SLOTS,
  WETH,
  assessHook,
} from "../src/assessment.js";
import { ALLOWLISTED_FACTORY, USDC } from "../src/addresses.js";
import { PINNED_POOL_KEY } from "../src/phase1.js";
import { compatibleHookReads, fakeClient } from "./mockClient.js";

const HOOK: Address = "0x00000078BD49D5279a99b5F4011a5C61eE8caaC0";
const CODE = "0x60019000";
const POOL_ID: Hex = "0xf32349cbc41fec9d3194f2b4e9ee72ded0bfda412427be9cb8a4087f74bdb065";

function routes(overrides: {
  reads?: Record<string, unknown>;
  code?: Record<string, string>;
  storage?: Record<string, Hex>;
  chainId?: number;
  head?: bigint;
} = {}) {
  return {
    head: 25_934_000n,
    code: { [HOOK.toLowerCase()]: CODE },
    reads: {
      ...compatibleHookReads(HOOK, ALLOWLISTED_FACTORY),
      [`${HOOK.toLowerCase()}.livePools(${POOL_ID})`]: true,
      [`${HOOK.toLowerCase()}.livePools(0x${"0".repeat(64)})`]: true,
    },
    ...overrides,
  };
}

describe("assessHook: compatibility", () => {
  it("reports supported with the interface and view evidence used", async () => {
    const { client } = fakeClient(routes());
    const result = await assessHook(client, { hook: HOOK, poolId: POOL_ID, poolKey: PINNED_POOL_KEY, blockNumber: 25_930_000n });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data.compatibility.status).toBe("supported");
    expect(result.data.compatibility.evidence.map((entry) => entry.observed)).toEqual(
      expect.arrayContaining([expect.stringContaining("erc165(0x01ffc9a7)=true"), expect.stringContaining("maxGas()=800000")]),
    );
    expect(result.chain).toEqual({ chainId: 1, blockNumber: 25_930_000n, blockSource: "pinned" });
  });

  it("reports unsupported when ERC-165 base fails", async () => {
    const { client } = fakeClient(routes({
      reads: { ...compatibleHookReads(HOOK, ALLOWLISTED_FACTORY), [`${HOOK.toLowerCase()}.supportsInterface(0x01ffc9a7)`]: false },
    }));
    const result = await assessHook(client, { hook: HOOK, blockNumber: 25_930_000n });
    expect(result.status === "ok" && result.data.compatibility.status).toBe("unsupported");
  });

  it("reports unsupported when the IALFHook interface id is not advertised", async () => {
    const { client } = fakeClient(routes({
      reads: { ...compatibleHookReads(HOOK, ALLOWLISTED_FACTORY), [`${HOOK.toLowerCase()}.supportsInterface(0x7adbfbb8)`]: false },
    }));
    const result = await assessHook(client, { hook: HOOK, blockNumber: 25_930_000n });
    expect(result.status === "ok" && result.data.compatibility.status).toBe("unsupported");
  });

  it("reports unverified when interface reads throw", async () => {
    const { client } = fakeClient(routes({
      reads: { ...compatibleHookReads(HOOK, ALLOWLISTED_FACTORY), [`${HOOK.toLowerCase()}.supportsInterface(0x01ffc9a7)`]: new Error("rpc down") },
    }));
    const result = await assessHook(client, { hook: HOOK, blockNumber: 25_930_000n });
    expect(result.status === "ok" && result.data.compatibility.status).toBe("unverified");
  });

  it("reports unverified when required view calls throw", async () => {
    const base = routes();
    const { client } = fakeClient({
      ...base,
      reads: {
        ...base.reads,
        [`${HOOK.toLowerCase()}.maxGas()`]: new Error("revert"),
      },
    });
    const result = await assessHook(client, { hook: HOOK, blockNumber: 25_930_000n });
    expect(result.status === "ok" && result.data.compatibility.status).toBe("unverified");
  });

  it("returns unverified (never a raw rejection) when the bytecode probe throws", async () => {
    const { client } = fakeClient(routes());
    const broken = Object.assign(client, {
      getCode: async () => {
        throw new Error("transport reset");
      },
    });
    const result = await assessHook(broken, { hook: HOOK, poolKey: PINNED_POOL_KEY, blockNumber: 25_930_000n });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data.compatibility.status).toBe("unverified");
    expect(result.data.upgradeability.status).toBe("unverified");
    expect(result.warnings.map((warning) => warning.code)).toContain("assess/partial-failures");
  });

  it("errors with assess/read-failed when the head probe throws on unpinned runs", async () => {
    const { client } = fakeClient({ ...routes(), head: undefined });
    const result = await assessHook(client, { hook: HOOK, poolKey: PINNED_POOL_KEY });
    expect(result.status).toBe("error");
    if (result.status === "error") expect(result.error.code).toBe("assess/read-failed");
  });

  it("reports unsupported for missing bytecode (and upgradeability unverified)", async () => {
    const { client } = fakeClient(routes({ code: {} }));
    const result = await assessHook(client, { hook: HOOK, blockNumber: 25_930_000n });
    expect(result.status === "ok" && result.data.compatibility.status).toBe("unsupported");
    expect(result.status === "ok" && result.data.upgradeability.status).toBe("unverified");
  });
});

describe("assessHook: provenance", () => {
  it("reports factory only with two-way agreement", async () => {
    const { client } = fakeClient(routes());
    const result = await assessHook(client, { hook: HOOK, blockNumber: 25_930_000n });
    expect(result.status === "ok" && result.data.provenance.status).toBe("factory");
  });

  it("downgrades to unknown on one-sided evidence", async () => {
    const { client } = fakeClient(routes({
      reads: { ...compatibleHookReads(HOOK, ALLOWLISTED_FACTORY), [`${ALLOWLISTED_FACTORY.toLowerCase()}.isFromFactory(${HOOK})`]: false },
    }));
    const result = await assessHook(client, { hook: HOOK, blockNumber: 25_930_000n });
    expect(result.status === "ok" && result.data.provenance.status).toBe("unknown");
  });

  it("stays unknown when provenance reads throw", async () => {
    const { client } = fakeClient(routes({
      reads: { ...compatibleHookReads(HOOK, ALLOWLISTED_FACTORY), [`${HOOK.toLowerCase()}.factory()`]: new Error("revert") },
    }));
    const result = await assessHook(client, { hook: HOOK, blockNumber: 25_930_000n });
    expect(result.status === "ok" && result.data.provenance.status).toBe("unknown");
  });

  it("reports fixture from the explicit flag without factory calls", async () => {
    const { client, calls } = fakeClient(routes({
      reads: {
        ...compatibleHookReads(HOOK, ALLOWLISTED_FACTORY),
        [`${ALLOWLISTED_FACTORY.toLowerCase()}.isFromFactory(${HOOK})`]: new Error("must not be called"),
      },
    }));
    const result = await assessHook(client, { hook: HOOK, fixture: true, blockNumber: 25_930_000n });
    expect(result.status === "ok" && result.data.provenance.status).toBe("fixture");
    expect(calls.some((call) => call.functionName === "isFromFactory")).toBe(false);
  });
});

describe("assessHook: routing", () => {
  it("reports manual-review for a 0x91-prefixed hook address", async () => {
    const prefixed: Address = "0x9100000000000000000000000000000000000000";
    const { client } = fakeClient(routes({
      code: { [prefixed.toLowerCase()]: CODE },
      reads: compatibleHookReads(prefixed, ALLOWLISTED_FACTORY),
    }));
    const result = await assessHook(client, { hook: prefixed, poolKey: PINNED_POOL_KEY, blockNumber: 25_930_000n });
    expect(result.status === "ok" && result.data.routing.status).toBe("manual-review");
  });

  it("reports manual-review for a dynamic-fee pool", async () => {
    const { client } = fakeClient(routes());
    const dynamic = { ...PINNED_POOL_KEY, fee: 0x800000 | 10 };
    const result = await assessHook(client, { hook: HOOK, poolKey: dynamic, blockNumber: 25_930_000n });
    expect(result.status === "ok" && result.data.routing.status).toBe("manual-review");
  });

  it("reports manual-review for the default major pair (USDC/WETH)", async () => {
    const { client } = fakeClient(routes());
    const major = { ...PINNED_POOL_KEY, currency1: WETH };
    const result = await assessHook(client, { hook: HOOK, poolKey: major, blockNumber: 25_930_000n });
    expect(result.status === "ok" && result.data.routing.status).toBe("manual-review");
  });

  it("honors a custom major-pair policy", async () => {
    const { client } = fakeClient(routes());
    const result = await assessHook(client, {
      hook: HOOK,
      poolKey: PINNED_POOL_KEY,
      majorPairs: [[USDC, PINNED_POOL_KEY.currency1]],
      blockNumber: 25_930_000n,
    });
    expect(result.status === "ok" && result.data.routing.status).toBe("manual-review");
  });

  it("reports automatic only with full policy inputs and no trigger", async () => {
    const { client } = fakeClient(routes());
    const result = await assessHook(client, { hook: HOOK, poolKey: PINNED_POOL_KEY, blockNumber: 25_930_000n });
    expect(result.status === "ok" && result.data.routing.status).toBe("automatic");
  });

  it("reports unknown without pool context (never a favorable guess)", async () => {
    const { client } = fakeClient(routes());
    const result = await assessHook(client, { hook: HOOK, blockNumber: 25_930_000n });
    expect(result.status === "ok" && result.data.routing.status).toBe("unknown");
    expect(result.status === "ok" && result.warnings.map((warning) => warning.code)).toContain("assess/routing-policy-incomplete");
  });
});

describe("assessHook: upgradeability", () => {
  it("detects an EIP-1967 implementation slot", async () => {
    const { client } = fakeClient(routes({
      storage: { [`${HOOK.toLowerCase()}:${EIP1967_SLOTS.implementation}`]: ("0x" + "11".repeat(20)) as Hex },
    }));
    const result = await assessHook(client, { hook: HOOK, blockNumber: 25_930_000n });
    expect(result.status === "ok" && result.data.upgradeability.status).toBe("detected");
  });

  it("detects EIP-1167 minimal-proxy bytecode", async () => {
    const { client } = fakeClient(routes({
      code: { [HOOK.toLowerCase()]: EIP1167_PREFIX + "ff".repeat(20) + "5af43d82803e903d91602b57fd5bf3" },
    }));
    const result = await assessHook(client, { hook: HOOK, blockNumber: 25_930_000n });
    expect(result.status === "ok" && result.data.upgradeability.status).toBe("detected");
  });

  it("reports unverified when proxy reads throw", async () => {
    const { client } = fakeClient(routes());
    const broken = Object.assign(client, {
      getStorageAt: async () => {
        throw new Error("archive node required");
      },
    });
    const result = await assessHook(broken, { hook: HOOK, blockNumber: 25_930_000n });
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.data.upgradeability.status).toBe("unverified");
    expect(
      result.data.upgradeability.evidence.some((entry) => entry.observed.includes("proxy checks failed")),
    ).toBe(true);
  });

  it("reports not-detected with an explicit cannot-prove-immutability caveat", async () => {
    const { client } = fakeClient(routes({ storage: {} }));
    const result = await assessHook(client, { hook: HOOK, blockNumber: 25_930_000n });
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.data.upgradeability.status).toBe("not-detected");
    expect(
      result.data.upgradeability.evidence.some((entry) => entry.observed.includes("cannot prove immutability")),
    ).toBe(true);
  });
});

describe("assessHook: envelope behavior", () => {
  it("errors on chain mismatch with the shared code", async () => {
    const { client } = fakeClient(routes({ chainId: 137 }));
    const result = await assessHook(client, { hook: HOOK, blockNumber: 25_930_000n });
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.error.code).toBe("rpc/chain-mismatch");
      expect([...ASSESS_ERROR_CODES, "rpc/chain-mismatch", "rpc/read-failed"]).toContain(result.error.code);
    }
  });

  it("pins unpinned reads to the current head and labels the source latest", async () => {
    const { client } = fakeClient(routes({ head: 25_934_123n }));
    const result = await assessHook(client, { hook: HOOK, poolKey: PINNED_POOL_KEY });
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.chain).toEqual({ chainId: 1, blockNumber: 25_934_123n, blockSource: "latest" });
    }
  });

  it("exposes the four dimensions independently with no combined verdict key", async () => {
    const { client } = fakeClient(routes());
    const result = await assessHook(client, { hook: HOOK, poolKey: PINNED_POOL_KEY, blockNumber: 25_930_000n });
    if (result.status !== "ok") throw new Error("expected ok");
    expect(Object.keys(result.data).sort()).toEqual(["compatibility", "provenance", "routing", "upgradeability"]);
    expect("safe" in result.data).toBe(false);
    expect("score" in result.data).toBe(false);
    expect("recommendation" in result.data).toBe(false);
  });
});

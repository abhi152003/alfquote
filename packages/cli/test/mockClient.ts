/** CLI-test mock transport: the full read surface the four commands touch, no state changes. */
import type { Address, Hex, PublicClient } from "viem";

export interface MockRoutes {
  chainId?: number;
  head?: bigint;
  code?: Record<string, string>;
  storage?: Record<string, Hex>;
  reads?: Record<string, unknown>;
  call?: (req: { to: Address; data: Hex; gas?: bigint; blockNumber?: bigint }) => { data: Hex };
  estimateGas?: bigint | Error;
}

export interface MockedClient {
  client: PublicClient;
  calls: Array<Record<string, unknown>>;
}

export function fakeClient(routes: MockRoutes): MockedClient {
  const calls: Array<Record<string, unknown>> = [];
  const ZERO_WORD = ("0x" + "0".repeat(64)) as Hex;
  const client = {
    getChainId: async () => routes.chainId ?? 1,
    getBlockNumber: async () => {
      if (routes.head === undefined) throw new Error("no head configured");
      return routes.head;
    },
    getCode: async ({ address }: { address: Address }) => {
      calls.push({ method: "getCode", address });
      return routes.code?.[address.toLowerCase()] ?? "0x";
    },
    getStorageAt: async ({ address, slot }: { address: Address; slot: Hex }) => {
      calls.push({ method: "getStorageAt", address, args: [slot] });
      return routes.storage?.[`${address.toLowerCase()}:${slot}`] ?? ZERO_WORD;
    },
    readContract: async (req: { address: Address; functionName: string; args?: readonly unknown[] }) => {
      calls.push(req);
      const first = (req.args ?? [])[0];
      const keyArg = typeof first === "object" && first !== null ? JSON.stringify(first) : (first ?? "");
      const key = `${req.address.toLowerCase()}.${req.functionName}(${keyArg})`;
      const value = routes.reads?.[key];
      if (value instanceof Error) throw value;
      if (value === undefined) throw new Error(`unexpected read ${key}`);
      return value;
    },
    getLogs: async () => {
      calls.push({ method: "getLogs" });
      return [];
    },
    getBlock: async (req: { blockNumber?: bigint }) => {
      calls.push({ method: "getBlock", ...req });
      return { timestamp: 1_788_890_000n };
    },
    simulateContract: async (req: Record<string, unknown>) => {
      calls.push({ method: "simulateContract", ...req });
      return { request: { ...req } };
    },
    estimateContractGas: async (req: Record<string, unknown>) => {
      calls.push({ method: "estimateContractGas", ...req });
      if (routes.estimateGas instanceof Error) throw routes.estimateGas;
      if (routes.estimateGas !== undefined) return routes.estimateGas;
      throw new Error("unexpected estimateContractGas");
    },
    call: async (req: { to: Address; data: Hex; gas?: bigint; blockNumber?: bigint }) => {
      calls.push({ method: "eth_call", ...req });
      if (!routes.call) throw new Error("unexpected eth_call");
      return routes.call(req);
    },
  } as unknown as PublicClient;
  return { client, calls };
}

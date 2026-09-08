/** Shared mock PublicClient for service tests; read-only methods, no state changes. */
import type { Address, Hex, PublicClient } from "viem";

export interface MockLog {
  blockNumber: bigint | null;
  transactionHash: Hex | null;
  topics: readonly Hex[];
  data: Hex;
}

export interface MockRoutes {
  chainId?: number;
  head?: bigint;
  /** Runtime bytecode by lowercase address; default "0x" (absent). */
  code?: Record<string, string>;
  /** Storage by `${lowercaseAddress}:${slot}`; default a zero word. */
  storage?: Record<string, Hex>;
  /** readContract results by `${lowercaseAddress}.${functionName}(${firstArg})`. Errors throw. */
  reads?: Record<string, unknown>;
  /** Raw eth_call responder; when omitted any eth_call throws. */
  call?: (req: { to: Address; data: Hex; gas?: bigint; blockNumber?: bigint }) => { data: Hex } | Promise<{ data: Hex }>;
  /** getBlock result (timestamp only). */
  block?: { timestamp: bigint };
  /** estimateContractGas result; an Error throws (revert path). */
  estimateGas?: bigint | Error;
  logs?: MockLog[];
  getLogsError?: Error;
}

export interface MockCall {
  method?: string;
  functionName?: string;
  address?: Address;
  args?: readonly unknown[];
  blockNumber?: bigint | "latest";
  /** eth_call fields. */
  to?: Address;
  data?: Hex;
  gas?: bigint;
}

export interface MockedClient {
  client: PublicClient;
  calls: MockCall[];
}

export function fakeClient(routes: MockRoutes): MockedClient {
  const calls: MockCall[] = [];
  const ZERO_WORD = ("0x" + "0".repeat(64)) as Hex;
  const client = {
    getChainId: async () => routes.chainId ?? 1,
    getBlockNumber: async () => {
      calls.push({ method: "getBlockNumber" });
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
    getBlock: async (req: { blockNumber?: bigint }) => {
      calls.push({ method: "getBlock", ...req });
      return { timestamp: routes.block?.timestamp ?? 0n };
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
      calls.push({ method: "eth_call", functionName: "eth_call", ...req });
      if (!routes.call) throw new Error("unexpected eth_call");
      return routes.call(req);
    },
    getLogs: async (req: Record<string, unknown>) => {
      calls.push({ method: "getLogs", ...req });
      if (routes.getLogsError) throw routes.getLogsError;
      return routes.logs ?? [];
    },
  } as unknown as PublicClient;
  return { client, calls };
}

/** Standard hook read routes for a fully compatible DualPool-style hook. */
export function compatibleHookReads(hook: Address, factory: Address): Record<string, unknown> {
  const h = hook.toLowerCase();
  return {
    [`${h}.supportsInterface(0x01ffc9a7)`]: true,
    [`${h}.supportsInterface(0x7adbfbb8)`]: true,
    [`${h}.maxGas()`]: 800_000n,
    [`${h}.isLive()`]: true,
    [`${h}.factory()`]: factory,
    [`${factory.toLowerCase()}.isFromFactory(${hook})`]: true,
    [`${factory.toLowerCase()}.creationCodeHashOf(${hook})`]: "0x" + "ab".repeat(32),
  };
}

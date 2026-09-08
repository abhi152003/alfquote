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
  logs?: MockLog[];
  getLogsError?: Error;
}

export interface MockCall {
  method?: string;
  functionName?: string;
  address?: Address;
  args?: readonly unknown[];
  blockNumber?: bigint | "latest";
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

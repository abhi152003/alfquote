/**
 * Adapter for the Tenderly Admin RPC (WO-7).
 *
 * The adapter is only constructible from a `TenderlyConfig` (which only
 * `loadTenderlyConfig` can produce) and refuses to run any mutation until the
 * endpoint has been verified as a Tenderly Virtual Environment: a harmless
 * `evm_getLatest` probe plus a chain-id match. Mainnet endpoints fail
 * that probe, so the fail-closed ordering is enforced by construction.
 */

import { toHex } from "viem";
import type { Address, Hex } from "viem";
import { maskTenderlyUrl, TENDERLY_CHAIN_ID_ENV_VAR, type TenderlyConfig } from "./config.js";

export interface LatestBlockInfo {
  number?: string;
  hash?: string;
  parentHash?: string;
  [key: string]: unknown;
}

export interface UnsignedTransaction {
  from: Address;
  to: Address;
  data: Hex;
  value?: bigint;
}

export type RpcRequest = (method: string, params?: readonly unknown[]) => Promise<unknown>;

export interface TenderlyAdmin {
  config: TenderlyConfig;
  latestBlockInfo: LatestBlockInfo;
  /** Overwrite native ETH balance; returns the resulting tx/block hash. */
  setBalance(address: Address, wei: bigint): Promise<Hex>;
  /** Add ERC-20 balance (emits a synthetic Transfer event); returns tx/block hash. */
  addErc20Balance(token: Address, wallet: Address, amount: bigint): Promise<Hex>;
  /** Raw storage write; disclosed fallback only — callers must record every field. */
  setStorageAt(contract: Address, slot: Hex, value: Hex): Promise<Hex>;
  /** Submit an unsigned transaction (any `from`; the Virtual Environment accepts it). */
  sendUnsignedTransaction(tx: UnsignedTransaction): Promise<Hex>;
}

export class TenderlyAdminError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenderlyAdminError";
  }
}

const CALL_TIMEOUT_MS = 30_000;

/** Default raw JSON-RPC transport for the admin endpoint. Zero-param methods omit `params`. */
export function fetchRpcRequest(url: string, fetchFn: typeof fetch = fetch): RpcRequest {
  return async (method, params) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);
    try {
      const response = await fetchFn(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method,
          ...(params !== undefined ? { params } : {}),
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new TenderlyAdminError(`admin RPC ${method} returned HTTP ${response.status} (${maskTenderlyUrl(url)})`);
      }
      const body = (await response.json()) as { result?: unknown; error?: { message?: string } };
      if (body.error) {
        throw new TenderlyAdminError(`admin RPC ${method} failed: ${body.error.message ?? "unknown error"}`);
      }
      return body.result;
    } finally {
      clearTimeout(timer);
    }
  };
}

async function adminChainId(request: RpcRequest): Promise<number> {
  const result = await request("eth_chainId");
  if (typeof result !== "string") {
    throw new TenderlyAdminError(`eth_chainId on the admin endpoint returned ${JSON.stringify(result)}`);
  }
  return Number.parseInt(result, 16);
}

/**
 * Connect to the Admin RPC and verify it is the configured Virtual Environment.
 * The probe is the documented `evm_getLatest` admin method — read-only, and
 * unsupported on non-Tenderly endpoints. Fails closed: probe error, chain-id
 * mismatch, or a non-object probe result all abort before any mutation helper
 * is returned.
 */
export async function connectTenderlyAdmin(
  config: TenderlyConfig,
  request: RpcRequest = fetchRpcRequest(config.adminRpcUrl),
): Promise<TenderlyAdmin> {
  let latestBlockInfo: LatestBlockInfo;
  try {
    const probed = await request("evm_getLatest");
    if (typeof probed !== "object" || probed === null) {
      throw new TenderlyAdminError(`evm_getLatest returned ${JSON.stringify(probed)}`);
    }
    latestBlockInfo = probed as LatestBlockInfo;
  } catch (error) {
    throw new TenderlyAdminError(
      `Admin endpoint is not a verified Tenderly Virtual Environment (${maskTenderlyUrl(config.adminRpcUrl)}): ${error instanceof Error ? error.message : String(error)}. Refusing to run any Tenderly admin operation.`,
    );
  }
  const chainId = await adminChainId(request);
  if (chainId !== config.chainId) {
    throw new TenderlyAdminError(
      `Admin endpoint chain id ${chainId} does not match ${TENDERLY_CHAIN_ID_ENV_VAR} ${config.chainId}.`,
    );
  }
  const hex = (value: unknown): Hex => {
    if (typeof value !== "string" || !value.startsWith("0x")) {
      throw new TenderlyAdminError(`admin RPC expected a 0x hash, got ${JSON.stringify(value)}`);
    }
    return value as Hex;
  };
  return {
    config,
    latestBlockInfo,
    async setBalance(address, wei) {
      return hex(await request("tenderly_setBalance", [[address], toHex(wei)]));
    },
    async addErc20Balance(token, wallet, amount) {
      return hex(await request("tenderly_addErc20Balance", [token, [wallet], toHex(amount)]));
    },
    async setStorageAt(contract, slot, value) {
      return hex(await request("tenderly_setStorageAt", [contract, slot, value]));
    },
    async sendUnsignedTransaction(tx) {
      const params: Record<string, `0x${string}`> = {
        from: tx.from,
        to: tx.to,
        data: tx.data,
        ...(tx.value !== undefined ? { value: toHex(tx.value) } : {}),
      };
      return hex(await request("eth_sendTransaction", [params]));
    },
  };
}

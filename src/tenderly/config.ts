/**
 * Environment contract for the Tenderly controlled-fork path (WO-7).
 *
 * Fail-closed like the mainnet config: a missing or malformed value must stop
 * the run before any RPC call. The admin RPC URL is a secret — it is never
 * logged or exported, and every derived display string goes through
 * `maskTenderlyUrl`.
 */

import { getAddress, isAddress } from "viem";
import type { Address } from "viem";

export const TENDERLY_PUBLIC_RPC_URL_ENV_VAR = "TENDERLY_PUBLIC_RPC_URL";
export const TENDERLY_ADMIN_RPC_URL_ENV_VAR = "TENDERLY_ADMIN_RPC_URL";
export const TENDERLY_FORK_BLOCK_ENV_VAR = "TENDERLY_FORK_BLOCK";
export const TENDERLY_CHAIN_ID_ENV_VAR = "TENDERLY_CHAIN_ID";
export const ALFQUOTE_TENDERLY_FROM_ENV_VAR = "ALFQUOTE_TENDERLY_FROM";

export class TenderlyConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenderlyConfigError";
  }
}

/** Runtime brand: only `loadTenderlyConfig` constructs values carrying it. */
const tenderlyConfigBrand: unique symbol = Symbol("ALFQuote.tenderlyConfig");

/**
 * Only `loadTenderlyConfig` can construct this type, so Tenderly mutation
 * helpers cannot be reached through the mainnet configuration path.
 */
export interface TenderlyConfig {
  readonly [tenderlyConfigBrand]: true;
  /** Virtual Environment standard JSON-RPC endpoint (no cheatcodes). */
  publicRpcUrl: string;
  /** Virtual Environment Admin RPC endpoint (cheatcodes + unsigned sends). Secret. */
  adminRpcUrl: string;
  /** Ethereum mainnet block the fork originates from; verified against state. */
  forkBlock: bigint;
  /** Chain id configured at Virtual Environment creation; must not be 1. */
  chainId: number;
  /** Dedicated test address used for funding, approvals, and the swap. */
  from: Address;
}

function requireHttpUrl(env: Record<string, string | undefined>, name: string): string {
  const raw = env[name]?.trim();
  if (raw === undefined || raw === "") {
    throw new TenderlyConfigError(`${name} is not set. Copy .env.example to .env and set it to the Tenderly Virtual Environment ${name === TENDERLY_ADMIN_RPC_URL_ENV_VAR ? "Admin RPC" : "Public RPC"} URL.`);
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new TenderlyConfigError(`${name} is not a valid URL: "${maskTenderlyUrl(raw)}".`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new TenderlyConfigError(`${name} must use http or https, but "${maskTenderlyUrl(raw)}" uses "${parsed.protocol}".`);
  }
  return raw;
}

function requirePositiveInt(env: Record<string, string | undefined>, name: string): bigint {
  const raw = env[name]?.trim();
  if (raw === undefined || raw === "" || !/^[1-9][0-9]*$/.test(raw)) {
    throw new TenderlyConfigError(`${name} must be a positive integer, got "${raw ?? ""}".`);
  }
  return BigInt(raw);
}

/** Parse and validate the Tenderly environment. */
export function loadTenderlyConfig(env: Record<string, string | undefined>): TenderlyConfig {
  const publicRpcUrl = requireHttpUrl(env, TENDERLY_PUBLIC_RPC_URL_ENV_VAR);
  const adminRpcUrl = requireHttpUrl(env, TENDERLY_ADMIN_RPC_URL_ENV_VAR);
  const forkBlock = requirePositiveInt(env, TENDERLY_FORK_BLOCK_ENV_VAR);
  const chainId = Number(requirePositiveInt(env, TENDERLY_CHAIN_ID_ENV_VAR));
  if (chainId > 0xffffffff) {
    throw new TenderlyConfigError(`${TENDERLY_CHAIN_ID_ENV_VAR} ${chainId} is not a valid EVM chain id.`);
  }
  if (chainId === 1) {
    throw new TenderlyConfigError(
      `${TENDERLY_CHAIN_ID_ENV_VAR} must not be 1: the controlled fork must never be confusable with Ethereum mainnet (Tenderly recommends a unique chain id, e.g. 73571).`,
    );
  }
  const fromRaw = env[ALFQUOTE_TENDERLY_FROM_ENV_VAR]?.trim();
  if (fromRaw === undefined || fromRaw === "" || !isAddress(fromRaw)) {
    throw new TenderlyConfigError(
      `${ALFQUOTE_TENDERLY_FROM_ENV_VAR} is not set or not a valid address. Set a dedicated test address; it is never used to sign on mainnet.`,
    );
  }
  return {
    [tenderlyConfigBrand]: true,
    publicRpcUrl,
    adminRpcUrl,
    forkBlock,
    chainId,
    from: getAddress(fromRaw),
  } as TenderlyConfig;
}

/**
 * Mask a Tenderly endpoint for display: keep only scheme and host. The path of
 * a Virtual Environment RPC URL can carry an access key, so it is never shown.
 */
export function maskTenderlyUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}/***`;
  } catch {
    return "<unparseable>";
  }
}

/** True when two endpoint URLs share a host — used to keep the fork's archive reads off the fork itself. */
export function sameHost(a: string, b: string): boolean {
  try {
    return new URL(a).host === new URL(b).host;
  } catch {
    return false;
  }
}

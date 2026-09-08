/**
 * Fork identity proof (WO-8): the Virtual Environment must be a fork of
 * Ethereum mainnet at the explicitly recorded block before anything mutates it.
 */

import type { Address, Hex } from "viem";
import { toHex } from "viem";
import {
  derivePoolId, poolStateSlot, type PoolKey,
  FIXTURE_HOOK,
  FIXTURE_POOL_ID,
  PERMIT2,
  PINNED_POOL_KEY,
  POOL_MANAGER,
  UNIVERSAL_ROUTER,
  USDC,
  USDT,
} from "alfquote";
import { sameHost, type TenderlyConfig } from "./config.js";
import type { LatestBlockInfo, TenderlyAdmin } from "./adminClient.js";

export class ForkVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForkVerificationError";
  }
}

export const FINGERPRINT_CONTRACTS: ReadonlyArray<{ name: string; address: Address }> = [
  { name: "PoolManager", address: POOL_MANAGER },
  { name: "DualPool fixture hook", address: FIXTURE_HOOK },
  { name: "Universal Router v2", address: UNIVERSAL_ROUTER },
  { name: "Permit2", address: PERMIT2 },
  { name: "USDC", address: USDC },
  { name: "USDT", address: USDT },
];

export interface OriginStats {
  reserves: readonly [bigint, bigint] | null;
  effectiveLiquidity: readonly [bigint, bigint] | null;
}

export interface VerifyDeps {
  forkChainId(): Promise<number>;
  forkHead(): Promise<bigint>;
  forkCode(address: Address): Promise<Hex | undefined>;
  mainnetCode(address: Address, block: bigint): Promise<Hex | undefined>;
  forkStorageAtOrigin(contract: Address, slot: Hex): Promise<Hex>;
  mainnetStorage(contract: Address, slot: Hex, block: bigint): Promise<Hex>;
  forkBlockHash(block: bigint): Promise<Hex>;
  mainnetBlockHash(block: bigint): Promise<Hex>;
  /** DualPool reserves/effective-liquidity AT the origin block, per chain (informational). */
  originStats(side: "fork" | "mainnet"): Promise<OriginStats>;
}

/** Consecutive `pools[poolId]` words compared at the origin block: Pool slot0, fee growth, liquidity, deltas. */
export const POOL_STATE_WORD_COUNT = 6;

export interface ForkVerification {
  chainId: number;
  forkHead: bigint;
  originBlock: bigint;
  /**
   * Virtual Environments re-seal blocks with their own hashes (different chain
   * id => different headers), so fork and mainnet block hashes at the origin
   * block can never be equal. Origin is proven by state: bytecode, the pool
   * state word, and DualPool reserves/effective-liquidity all compared AT the
   * origin block. Both block hashes are still recorded as identifiers.
   */
  originCheck: "state-fingerprint-at-origin-block";
  forkOriginBlockHash: Hex;
  mainnetOriginBlockHash: Hex;
  originStatsFork: OriginStats;
  originStatsMainnet: OriginStats;
  /** All consecutive pool-state words match at the origin block (required). */
  poolStateWordsMatch: boolean;
  bytecodeMatches: ReadonlyArray<{ name: string; address: Address; match: boolean }>;
  poolStateSlot: Hex;
  poolStateWordFork: Hex;
  poolStateWordMainnet: Hex;
  poolStateMatch: boolean;
  poolIdOffline: Hex;
  latestBlockInfo: LatestBlockInfo;
}

const ZERO_WORD = `0x${"0".repeat(64)}` as Hex;

function hasCode(code: Hex | undefined): boolean {
  return code !== undefined && code !== "0x";
}

function equalCode(fork: Hex | undefined, mainnet: Hex | undefined): boolean {
  return hasCode(fork) && hasCode(mainnet) && fork === mainnet;
}

export function assertDistinctEndpoints(config: TenderlyConfig, mainnetRpcUrl: string): void {
  if (sameHost(config.publicRpcUrl, mainnetRpcUrl) || sameHost(config.adminRpcUrl, mainnetRpcUrl)) {
    throw new ForkVerificationError(
      "ETHEREUM_RPC_URL shares a host with a Tenderly endpoint. Mainnet evidence must come from a mainnet RPC, not from the controlled fork.",
    );
  }
}

export function assertPinnedPoolIdentity(key: PoolKey = PINNED_POOL_KEY, expected: Hex = FIXTURE_POOL_ID): Hex {
  const derived = derivePoolId(key);
  if (derived !== expected) {
    throw new ForkVerificationError(`derivePoolId(pin) ${derived} != documented ${expected}`);
  }
  return derived;
}

export async function verifyFork(
  config: TenderlyConfig,
  admin: TenderlyAdmin,
  deps: VerifyDeps,
): Promise<ForkVerification> {
  const chainId = await deps.forkChainId();
  if (chainId !== config.chainId) {
    throw new ForkVerificationError(`Fork chain id ${chainId} != configured ${config.chainId}.`);
  }
  const forkHead = await deps.forkHead();
  if (forkHead < config.forkBlock) {
    throw new ForkVerificationError(
      `Fork head ${forkHead} is below configured origin block ${config.forkBlock}.`,
    );
  }
  const slot = poolStateSlot(FIXTURE_POOL_ID);
  const poolIdOffline = assertPinnedPoolIdentity();

  const bytecodeMatches = await Promise.all(
    FINGERPRINT_CONTRACTS.map(async ({ name, address }) => ({
      name,
      address,
      match: equalCode(await deps.forkCode(address), await deps.mainnetCode(address, config.forkBlock)),
    })),
  );
  const slotAt = (index: number): Hex => toHex(BigInt(slot) + BigInt(index), { size: 32 });
  const [forkWords, mainnetWords, forkOriginBlockHash, mainnetOriginBlockHash, originStatsFork, originStatsMainnet] =
    await Promise.all([
      Promise.all(Array.from({ length: POOL_STATE_WORD_COUNT }, (_, i) => deps.forkStorageAtOrigin(POOL_MANAGER, slotAt(i)))),
      Promise.all(Array.from({ length: POOL_STATE_WORD_COUNT }, (_, i) => deps.mainnetStorage(POOL_MANAGER, slotAt(i), config.forkBlock))),
      deps.forkBlockHash(config.forkBlock),
      deps.mainnetBlockHash(config.forkBlock),
      deps.originStats("fork"),
      deps.originStats("mainnet"),
    ]);
  const poolStateWordFork = forkWords[0] ?? ZERO_WORD;
  const poolStateWordMainnet = mainnetWords[0] ?? ZERO_WORD;
  const poolStateMatch = poolStateWordFork === poolStateWordMainnet && poolStateWordFork !== ZERO_WORD;
  const poolStateWordsMatch =
    forkWords.length === POOL_STATE_WORD_COUNT &&
    mainnetWords.length === POOL_STATE_WORD_COUNT &&
    forkWords.every((word, i) => word === mainnetWords[i]);
  const validHash = (hash: Hex) => /^0x[0-9a-fA-F]{64}$/.test(hash);
  const bytecodeOk = bytecodeMatches.every((entry) => entry.match);
  const hashesOk = validHash(forkOriginBlockHash) && validHash(mainnetOriginBlockHash);

  if (!bytecodeOk || !poolStateMatch || !poolStateWordsMatch || !hashesOk) {
    const problems: string[] = [];
    const failedContracts = bytecodeMatches.filter((entry) => !entry.match).map((entry) => entry.name);
    if (failedContracts.length > 0) problems.push(`bytecode mismatch: ${failedContracts.join(", ")}`);
    if (!poolStateMatch) problems.push(`pool state mismatch at block ${config.forkBlock}`);
    if (!poolStateWordsMatch) problems.push(`pool state words 0..${POOL_STATE_WORD_COUNT - 1} differ between fork and mainnet at block ${config.forkBlock}`);
    if (!hashesOk) problems.push("origin block hash missing on the fork or on mainnet");
    throw new ForkVerificationError(`Fork origin verification failed: ${problems.join("; ")}.`);
  }

  return {
    chainId,
    forkHead,
    originBlock: config.forkBlock,
    originCheck: "state-fingerprint-at-origin-block",
    forkOriginBlockHash,
    mainnetOriginBlockHash,
    originStatsFork,
    originStatsMainnet,
    poolStateWordsMatch,
    bytecodeMatches,
    poolStateSlot: slot,
    poolStateWordFork,
    poolStateWordMainnet,
    poolStateMatch,
    poolIdOffline,
    latestBlockInfo: admin.latestBlockInfo,
  };
}

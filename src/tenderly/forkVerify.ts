/**
 * Fork identity proof (WO-8): the Virtual Environment must be a fork of
 * Ethereum mainnet at the explicitly recorded block before anything mutates it.
 */

import type { Address, Hex } from "viem";
import { derivePoolId, poolStateSlot, type PoolKey } from "../pool.js";
import {
  FIXTURE_HOOK,
  FIXTURE_POOL_ID,
  PERMIT2,
  PINNED_POOL_KEY,
  POOL_MANAGER,
  UNIVERSAL_ROUTER,
  USDC,
  USDT,
} from "../addresses.js";
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

export interface VerifyDeps {
  forkChainId(): Promise<number>;
  forkHead(): Promise<bigint>;
  forkCode(address: Address): Promise<Hex | undefined>;
  mainnetCode(address: Address, block: bigint): Promise<Hex | undefined>;
  forkStorageAtOrigin(contract: Address, slot: Hex): Promise<Hex>;
  mainnetStorage(contract: Address, slot: Hex, block: bigint): Promise<Hex>;
  forkBlockHash(block: bigint): Promise<Hex>;
  mainnetBlockHash(block: bigint): Promise<Hex>;
}

export interface ForkVerification {
  chainId: number;
  forkHead: bigint;
  originBlock: bigint;
  originCheck: "block-hash-and-state-fingerprint";
  forkOriginBlockHash: Hex;
  mainnetOriginBlockHash: Hex;
  blockHashMatch: boolean;
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
  const [poolStateWordFork, poolStateWordMainnet, forkOriginBlockHash, mainnetOriginBlockHash] =
    await Promise.all([
      deps.forkStorageAtOrigin(POOL_MANAGER, slot),
      deps.mainnetStorage(POOL_MANAGER, slot, config.forkBlock),
      deps.forkBlockHash(config.forkBlock),
      deps.mainnetBlockHash(config.forkBlock),
    ]);
  const poolStateMatch = poolStateWordFork === poolStateWordMainnet && poolStateWordFork !== ZERO_WORD;
  const blockHashMatch = forkOriginBlockHash === mainnetOriginBlockHash;
  const bytecodeOk = bytecodeMatches.every((entry) => entry.match);

  if (!bytecodeOk || !poolStateMatch || !blockHashMatch) {
    const problems: string[] = [];
    const failedContracts = bytecodeMatches.filter((entry) => !entry.match).map((entry) => entry.name);
    if (failedContracts.length > 0) problems.push(`bytecode mismatch: ${failedContracts.join(", ")}`);
    if (!poolStateMatch) problems.push(`pool state mismatch at block ${config.forkBlock}`);
    if (!blockHashMatch) {
      problems.push(
        `origin block hash mismatch: fork ${forkOriginBlockHash}, mainnet ${mainnetOriginBlockHash}`,
      );
    }
    throw new ForkVerificationError(`Fork origin verification failed: ${problems.join("; ")}.`);
  }

  return {
    chainId,
    forkHead,
    originBlock: config.forkBlock,
    originCheck: "block-hash-and-state-fingerprint",
    forkOriginBlockHash,
    mainnetOriginBlockHash,
    blockHashMatch,
    bytecodeMatches,
    poolStateSlot: slot,
    poolStateWordFork,
    poolStateWordMainnet,
    poolStateMatch,
    poolIdOffline,
    latestBlockInfo: admin.latestBlockInfo,
  };
}

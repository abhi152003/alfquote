import type { Address, Hex, PublicClient } from "viem";
import { factoryAbi } from "./abis.js";

export interface DeploymentRecord {
  address: Address;
  index: number;
}

/** Non-empty runtime bytecode at `address`. viem returns undefined for empty code, not "0x". */
export async function hasBytecode(
  client: PublicClient,
  address: Address,
  blockNumber?: bigint,
): Promise<{ present: boolean; size: number }> {
  const code = await client.getCode({
    address,
    ...(blockNumber !== undefined ? { blockNumber } : {}),
  });
  const present = code !== undefined && code !== "0x";
  return { present, size: present ? (code.length - 2) / 2 : 0 };
}

/** Enumerate the factory registry: allDeploymentsLength + allDeployments(i). */
export async function enumerateDeployments(
  client: PublicClient,
  factory: Address,
  blockNumber?: bigint,
): Promise<DeploymentRecord[]> {
  const atBlock = blockNumber !== undefined ? { blockNumber } : {};
  const length = await client.readContract({
    address: factory,
    abi: factoryAbi,
    functionName: "allDeploymentsLength",
    ...atBlock,
  });
  const deployments: DeploymentRecord[] = [];
  for (let i = 0n; i < length; i++) {
    const deployed = await client.readContract({
      address: factory,
      abi: factoryAbi,
      functionName: "allDeployments",
      args: [i],
      ...atBlock,
    });
    deployments.push({ address: deployed, index: Number(i) });
  }
  return deployments;
}

/** Forward provenance: factory-side attestation for a hook address. */
export async function factoryProvenance(
  client: PublicClient,
  factory: Address,
  hook: Address,
  blockNumber?: bigint,
): Promise<{ isFromFactory: boolean; creationCodeHash: Hex }> {
  const atBlock = blockNumber !== undefined ? { blockNumber } : {};
  const [isFromFactory, creationCodeHash] = await Promise.all([
    client.readContract({
      address: factory,
      abi: factoryAbi,
      functionName: "isFromFactory",
      args: [hook],
      ...atBlock,
    }),
    client.readContract({
      address: factory,
      abi: factoryAbi,
      functionName: "creationCodeHashOf",
      args: [hook],
      ...atBlock,
    }),
  ]);
  return { isFromFactory, creationCodeHash };
}

// -------------------------------------------------------------------------------------------
// Discovery service (WO-10). Envelope-returning, chain-1 only, partial-failure tolerant.
// -------------------------------------------------------------------------------------------

import { decodeEventLog, toEventSelector } from "viem";
import { poolManagerInitializeEvent } from "./abis.js";
import { ALLOWLISTED_FACTORY, POOL_MANAGER } from "./addresses.js";
import { reverseProvenance } from "./hookChecks.js";
import { derivePoolId } from "./pool.js";
import type { PoolKey, PoolId } from "./pool.js";
import type { ProvenanceStatus } from "./assessment.js";
import { errorMessage, errorResult, okResult } from "./result.js";
import type { ChainBlockContext, CommandResult, ErrorResult, Warning } from "./result.js";

/** Namespaced error codes owned by the discovery service. */
export const DISCOVER_ERROR_CODES = [
  "discover/factory-read-failed",
  "discover/registry-read-failed",
  "discover/hook-provenance-failed",
  "discover/fixture-not-deployed",
  "discover/fixture-read-failed",
  "discover/pool-scan-failed",
  "discover/log-decode-failed",
] as const;

export type DiscoverErrorCode = (typeof DISCOVER_ERROR_CODES)[number];

export const DISCOVER_WARNING_CODES = [
  "discover/partial-failures",
  "discover/provenance-one-sided",
  "discover/pool-id-mismatch",
] as const;

export type DiscoverWarningCode = (typeof DISCOVER_WARNING_CODES)[number];

export interface DiscoverHooksInput {
  readonly factory: Address;
  readonly fixtures: readonly Address[];
}

export interface DiscoverPoolsInput {
  readonly hook: Address;
  readonly fromBlock: bigint;
  readonly toBlock: bigint | null;
}

/** Raw two-way provenance observations; `null` fields mean the call failed. */
export interface HookProvenanceEvidence {
  /** Factory-side `isFromFactory(hook)`. */
  readonly isFromFactory: boolean | null;
  readonly creationCodeHash: Hex | null;
  /** Hook-side `factory()` report. */
  readonly hookReportedFactory: Address | null;
  readonly reverseMatches: boolean | null;
}

export interface DiscoveredHook {
  readonly address: Address;
  /** Registry index; `null` for explicit fixtures. */
  readonly registryIndex: number | null;
  /** `factory` only with forward AND reverse evidence; fixtures never claim it. */
  readonly provenance: ProvenanceStatus;
  readonly evidence: HookProvenanceEvidence;
  /** Block the provenance reads used; `null` means latest-state. */
  readonly block: bigint | null;
}

/** One failed target check; never erases results for other targets. */
export interface TargetFailure {
  readonly target: string;
  readonly code: DiscoverErrorCode;
  readonly message: string;
}

export interface FactoryHooksData {
  readonly factory: Address;
  readonly hooks: readonly DiscoveredHook[];
  readonly partialFailures: readonly TargetFailure[];
}

export interface DiscoveredPool {
  /** PoolId from the `Initialize` event topic. */
  readonly poolId: PoolId;
  /** `keccak256(abi.encode(reconstructedPoolKey))`; must match `poolId`. */
  readonly derivedPoolId: PoolId;
  readonly poolKeyMatches: boolean;
  readonly poolKey: PoolKey;
  readonly hook: Address;
  readonly block: bigint;
  readonly transactionHash: Hex;
}

export interface HookPoolsData {
  readonly hook: Address;
  readonly pools: readonly DiscoveredPool[];
  readonly partialFailures: readonly TargetFailure[];
}

function chainContext(chainId: number, blockNumber: bigint | undefined): ChainBlockContext {
  return {
    chainId,
    blockNumber: blockNumber ?? null,
    blockSource: blockNumber !== undefined ? "pinned" : "latest",
  };
}

async function assertMainnet<TInput extends object>(
  client: PublicClient,
  input: TInput,
  blockNumber: bigint | undefined,
): Promise<ChainBlockContext | { error: ErrorResult<TInput> }> {
  let chainId: number;
  try {
    chainId = await client.getChainId();
  } catch (error) {
    return {
      error: errorResult("discover", chainContext(0, blockNumber), input, {
        code: "rpc/read-failed",
        message: `chain id probe failed: ${errorMessage(error)}`,
      }),
    };
  }
  const chain = chainContext(chainId, blockNumber);
  if (chainId !== 1) {
    return {
      error: errorResult("discover", chain, input, {
        code: "rpc/chain-mismatch",
        message: `discovery targets Ethereum chain 1 only; client reported chain ${chainId}`,
      }),
    };
  }
  return chain;
}

/**
 * Enumerate the factory registry at an optional pinned block, verify two-way
 * (The registry arrays are the authoritative, append-only record; factory
 * `Deployed` events are not re-read — an accepted, documented scope choice.)
 * provenance per hook, and append explicit fixtures labeled `fixture` (with no
 * factory claim). Per-hook failures become `partialFailures`, never lost rows.
 */
export async function discoverFactoryHooks(
  client: PublicClient,
  args: {
    factory?: Address;
    fixtures?: readonly Address[];
    blockNumber?: bigint;
  } = {},
): Promise<CommandResult<FactoryHooksData, DiscoverHooksInput>> {
  const factory = args.factory ?? ALLOWLISTED_FACTORY;
  const fixtures = args.fixtures ?? [];
  const input: DiscoverHooksInput = { factory, fixtures };

  let chain: ChainBlockContext;
  {
    const guard = await assertMainnet(client, input, args.blockNumber);
    if ("error" in guard) return guard.error;
    chain = guard;
  }

  let factoryCode: { present: boolean; size: number };
  try {
    factoryCode = await hasBytecode(client, factory, args.blockNumber);
  } catch (error) {
    return errorResult("discover", chain, input, {
      code: "discover/factory-read-failed",
      message: `factory bytecode probe failed: ${errorMessage(error)}`,
    });
  }
  if (!factoryCode.present) {
    return errorResult("discover", chain, input, {
      code: "discover/factory-read-failed",
      message: `factory ${factory} has no runtime bytecode at the requested state`,
    });
  }

  let registry: DeploymentRecord[];
  try {
    registry = await enumerateDeployments(client, factory, args.blockNumber);
  } catch (error) {
    return errorResult("discover", chain, input, {
      code: "discover/registry-read-failed",
      message: `registry enumeration failed: ${errorMessage(error)}`,
    });
  }

  const partialFailures: TargetFailure[] = [];
  const warnings: Warning[] = [];
  const hooks: DiscoveredHook[] = [];

  for (const record of registry) {
    try {
      const [forward, reverse] = await Promise.all([
        factoryProvenance(client, factory, record.address, args.blockNumber),
        reverseProvenance(client, record.address, factory, args.blockNumber),
      ]);
      hooks.push({
        address: record.address,
        registryIndex: record.index,
        provenance: forward.isFromFactory && reverse.matches ? "factory" : "unknown",
        evidence: {
          isFromFactory: forward.isFromFactory,
          creationCodeHash: forward.creationCodeHash,
          hookReportedFactory: reverse.reported,
          reverseMatches: reverse.matches,
        },
        block: args.blockNumber ?? null,
      });
      if (forward.isFromFactory !== reverse.matches) {
        warnings.push({
          code: "discover/provenance-one-sided",
          message: `hook ${record.address}: forward=${forward.isFromFactory} reverse=${reverse.matches}; provenance is not factory`,
        });
      }
    } catch (error) {
      partialFailures.push({
        target: `hook:${record.address}`,
        code: "discover/hook-provenance-failed",
        message: errorMessage(error),
      });
      hooks.push({
        address: record.address,
        registryIndex: record.index,
        provenance: "unknown",
        evidence: {
          isFromFactory: null,
          creationCodeHash: null,
          hookReportedFactory: null,
          reverseMatches: null,
        },
        block: args.blockNumber ?? null,
      });
    }
  }

  for (const fixture of fixtures) {
    let fixtureCode: { present: boolean; size: number };
    try {
      fixtureCode = await hasBytecode(client, fixture, args.blockNumber);
    } catch (error) {
      partialFailures.push({
        target: `fixture:${fixture}`,
        code: "discover/fixture-read-failed",
        message: errorMessage(error),
      });
      continue;
    }
    if (!fixtureCode.present) {
      partialFailures.push({
        target: `fixture:${fixture}`,
        code: "discover/fixture-not-deployed",
        message: `fixture ${fixture} has no runtime bytecode at the requested state`,
      });
      continue;
    }
    hooks.push({
      address: fixture,
      registryIndex: null,
      provenance: "fixture",
      evidence: { isFromFactory: null, creationCodeHash: null, hookReportedFactory: null, reverseMatches: null },
      block: args.blockNumber ?? null,
    });
  }

  if (partialFailures.length > 0) {
    warnings.push({
      code: "discover/partial-failures",
      message: `${partialFailures.length} target check(s) failed; see partialFailures`,
    });
  }

  return okResult("discover", chain, input, { factory, hooks, partialFailures }, warnings);
}

/**
 * Scan PoolManager `Initialize` logs in an explicit block range and reconstruct
 * exact PoolKeys for pools whose hook matches. Malformed logs become
 * `partialFailures`; no matching pools is a valid typed outcome.
 */
export async function discoverHookPools(
  client: PublicClient,
  args: {
    hook: Address;
    fromBlock: bigint;
    toBlock?: bigint;
  },
): Promise<CommandResult<HookPoolsData, DiscoverPoolsInput>> {
  const input: DiscoverPoolsInput = { hook: args.hook, fromBlock: args.fromBlock, toBlock: args.toBlock ?? null };

  let chain: ChainBlockContext;
  {
    const guard = await assertMainnet(client, input, args.toBlock);
    if ("error" in guard) return guard.error;
    chain = guard;
  }

  let logs: ReadonlyArray<{ blockNumber: bigint | null; transactionHash: Hex | null; topics: readonly Hex[]; data: Hex }>;
  try {
    logs = await client.getLogs({
      address: POOL_MANAGER,
      fromBlock: args.fromBlock,
      toBlock: args.toBlock ?? "latest",
    });
  } catch (error) {
    return errorResult("discover", chain, input, {
      code: "discover/pool-scan-failed",
      message: `Initialize log scan failed: ${errorMessage(error)}`,
    });
  }

  const partialFailures: TargetFailure[] = [];
  const warnings: Warning[] = [];
  const pools: DiscoveredPool[] = [];
  const initializeSignature = toEventSelector(poolManagerInitializeEvent);

  for (const log of logs) {
    // The address-filtered scan returns every PoolManager event; only
    // Initialize-signature logs are candidates, others are simply skipped.
    if (log.topics[0]?.toLowerCase() !== initializeSignature.toLowerCase()) continue;
    const target = `log:${log.blockNumber ?? "?"}:${log.transactionHash ?? "?"}`;
    let decoded: { args: Record<string, unknown> };
    try {
      decoded = decodeEventLog({
        abi: [poolManagerInitializeEvent],
        data: log.data,
        topics: [...log.topics] as [Hex, ...Hex[]],
      }) as { args: Record<string, unknown> };
    } catch (error) {
      partialFailures.push({
        target,
        code: "discover/log-decode-failed",
        message: errorMessage(error),
      });
      continue;
    }
    const eventHook = decoded.args["hooks"];
    if (eventHook === undefined || typeof eventHook !== "string") {
      partialFailures.push({
        target,
        code: "discover/log-decode-failed",
        message: "Initialize args missing the hooks field",
      });
      continue;
    }
    if (eventHook.toLowerCase() !== args.hook.toLowerCase()) continue;

    const id = decoded.args["id"];
    const currency0 = decoded.args["currency0"];
    const currency1 = decoded.args["currency1"];
    const fee = decoded.args["fee"];
    const tickSpacing = decoded.args["tickSpacing"];
    if (
      typeof id !== "string" || typeof currency0 !== "string" || typeof currency1 !== "string" ||
      typeof fee !== "number" || typeof tickSpacing !== "number" ||
      log.blockNumber === null || log.transactionHash === null
    ) {
      partialFailures.push({
        target,
        code: "discover/log-decode-failed",
        message: "Initialize args incomplete for PoolKey reconstruction",
      });
      continue;
    }
    const poolKey: PoolKey = {
      currency0: currency0 as Address,
      currency1: currency1 as Address,
      fee,
      tickSpacing,
      hooks: eventHook as Address,
    };
    const derivedPoolId = derivePoolId(poolKey);
    pools.push({
      poolId: id as PoolId,
      derivedPoolId,
      poolKeyMatches: derivedPoolId.toLowerCase() === id.toLowerCase(),
      poolKey,
      hook: poolKey.hooks,
      block: log.blockNumber,
      transactionHash: log.transactionHash,
    });
  }

  if (partialFailures.length > 0) {
    warnings.push({
      code: "discover/partial-failures",
      message: `${partialFailures.length} log(s) failed to decode; see partialFailures`,
    });
  }
  const mismatched = pools.filter((pool) => !pool.poolKeyMatches);
  if (mismatched.length > 0) {
    warnings.push({
      code: "discover/pool-id-mismatch",
      message: `${mismatched.length} reconstructed PoolKey(s) derive a different PoolId than the event; suspect ABI drift`,
    });
  }

  return okResult("discover", chain, input, { hook: args.hook, pools, partialFailures }, warnings);
}

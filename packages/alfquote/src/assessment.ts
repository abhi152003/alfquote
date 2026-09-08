/**
 * Structured hook assessment types. The four dimensions are deliberately
 * independent: collapsing them into a single `safe` boolean is forbidden by
 * the public contract (see `HOOK_ASSESSMENT_KEYS`).
 */

import type { Address } from "viem";
import type { PoolId } from "./pool.js";

/** Whether ERC-165 and the required `IALFHook` calls establish a usable quote surface. */
export type CompatibilityStatus = "supported" | "unsupported" | "unverified";

/** Whether the official factory attests the deployed bytecode. */
export type ProvenanceStatus = "factory" | "fixture" | "unknown";

/** Whether current Uniswap Labs routing guidance indicates automatic handling. */
export type RoutingStatus = "automatic" | "manual-review" | "unknown";

/** Result of conservative proxy checks; absence of evidence is `unverified`, never `not-detected`. */
export type UpgradeabilityStatus = "not-detected" | "detected" | "unverified";

/** One observation backing a status value. */
export interface AssessmentEvidence {
  /** What was observed, e.g. `erc165(0x7adbfbb8)=true` or `factory.isFromFactory=false`. */
  readonly observed: string;
  /** Optional pointer to the rule or source the observation follows. */
  readonly source?: string;
}

export interface AssessmentField<TStatus extends string> {
  readonly status: TStatus;
  readonly evidence: readonly AssessmentEvidence[];
}

/** The entire assessment surface — exactly four independent fields, no combined `safe`. */
export interface HookAssessment {
  readonly compatibility: AssessmentField<CompatibilityStatus>;
  readonly provenance: AssessmentField<ProvenanceStatus>;
  readonly routing: AssessmentField<RoutingStatus>;
  readonly upgradeability: AssessmentField<UpgradeabilityStatus>;
}

/** Runtime list of the assessment dimensions, in reporting order. */
export const HOOK_ASSESSMENT_KEYS = [
  "compatibility",
  "provenance",
  "routing",
  "upgradeability",
] as const;

export type HookAssessmentKey = (typeof HOOK_ASSESSMENT_KEYS)[number];

type ExtraAssessmentKeys = Exclude<keyof HookAssessment, HookAssessmentKey>;
type MissingAssessmentKeys = Exclude<HookAssessmentKey, keyof HookAssessment>;
/**
 * Compile-time guard: adding any field (e.g. a combined `safe` boolean) or
 * removing one fails this assignment.
 */
const assessmentKeysExact: [ExtraAssessmentKeys] extends [never]
  ? [MissingAssessmentKeys] extends [never]
    ? true
    : "assessment dimension missing"
  : "unexpected assessment field" = true;

export interface AssessInput {
  readonly hook: Address;
  readonly poolId?: PoolId;
}

// -------------------------------------------------------------------------------------------
// Assessment service (WO-11). Four independent, evidence-backed dimensions; conservative
// by construction — missing code, failed reads, and unknown patterns produce uncertainty.
// -------------------------------------------------------------------------------------------

import type { Hex, PublicClient } from "viem";
import { ALLOWLISTED_FACTORY, IALFHOOK_INTERFACE_ID, USDC } from "./addresses.js";
import { hasBytecode, factoryProvenance } from "./discovery.js";
import { reverseProvenance, supportsInterface } from "./hookChecks.js";
import { readLiveness, readMaxGas } from "./alfQuote.js";
import type { PoolKey } from "./pool.js";
import { errorMessage, errorResult, okResult } from "./result.js";
import type { ChainBlockContext, CommandResult, ErrorResult, Warning } from "./result.js";

/** Namespaced error codes owned by the assessment service. */
export const ASSESS_ERROR_CODES = ["assess/read-failed"] as const;
export type AssessErrorCode = (typeof ASSESS_ERROR_CODES)[number];

export const ASSESS_WARNING_CODES = [
  "assess/partial-failures",
  "assess/routing-policy-incomplete",
] as const;

export type AssessWarningCode = (typeof ASSESS_WARNING_CODES)[number];

/** Canonical WETH9 on Ethereum mainnet; default major-pair policy member. */
export const WETH: Address = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

const IERC165_ID = "0x01ffc9a7" as Hex;

/** EIP-1967 proxy storage slots (keccak256("eip1967.proxy.{implementation,beacon,admin}") - 1). */
export const EIP1967_SLOTS = {
  implementation: "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as Hex,
  beacon: "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50" as Hex,
  admin: "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103" as Hex,
} as const;

/** EIP-1167 minimal-proxy runtime bytecode prefix (push20 implementation pattern). */
export const EIP1167_PREFIX = "0x363d3d373d3d3d363d73" as Hex;

/** v4 dynamic-fee flag in the PoolKey fee word. */
export const DYNAMIC_FEE_FLAG = 0x800000;

/** A major pair is an unordered currency pair; defaults to [USDC, WETH]. */
export type MajorPair = readonly [Address, Address];

export interface AssessOptions {
  readonly hook: Address;
  readonly poolId?: PoolId;
  readonly poolKey?: PoolKey;
  /** Explicit fixture: provenance reports `fixture` and no factory claim is made. */
  readonly fixture?: boolean;
  readonly factory?: Address;
  /** Unordered currency pairs that trigger manual routing review. */
  readonly majorPairs?: readonly MajorPair[];
  readonly blockNumber?: bigint;
}

function chainContext(chainId: number, blockNumber: bigint | undefined): ChainBlockContext {
  return {
    chainId,
    blockNumber: blockNumber ?? null,
    blockSource: blockNumber !== undefined ? "pinned" : "latest",
  };
}

async function assertMainnet(
  client: PublicClient,
  input: { hook: Address; poolId?: PoolId },
  blockNumber: bigint | undefined,
): Promise<ChainBlockContext | { error: ErrorResult<typeof input> }> {
  let chainId: number;
  try {
    chainId = await client.getChainId();
  } catch (error) {
    return {
      error: errorResult("assess", chainContext(0, blockNumber), input, {
        code: "rpc/read-failed",
        message: `chain id probe failed: ${errorMessage(error)}`,
      }),
    };
  }
  const chain = chainContext(chainId, blockNumber);
  if (chainId !== 1) {
    return {
      error: errorResult("assess", chain, input, {
        code: "rpc/chain-mismatch",
        message: `assessment targets Ethereum chain 1 only; client reported chain ${chainId}`,
      }),
    };
  }
  return chain;
}

interface CompatibilityOutcome {
  field: AssessmentField<CompatibilityStatus>;
  codePresent: boolean | null;
}

async function assessCompatibility(
  client: PublicClient,
  args: AssessOptions,
  atBlock: bigint,
  warnings: Warning[],
): Promise<CompatibilityOutcome> {
  const evidence: AssessmentEvidence[] = [];

  let code: { present: boolean; size: number };
  try {
    code = await hasBytecode(client, args.hook, atBlock);
  } catch (error) {
    warnings.push({
      code: "assess/partial-failures",
      message: `bytecode probe failed: ${errorMessage(error)}`,
    });
    evidence.push({ observed: `runtime bytecode probe failed: ${errorMessage(error)}` });
    return { field: { status: "unverified", evidence }, codePresent: null };
  }
  if (!code.present) {
    evidence.push({ observed: `runtime bytecode absent (size 0)` });
    return {
      field: { status: "unsupported", evidence },
      codePresent: false,
    };
  }
  evidence.push({ observed: `runtime bytecode present (${code.size} bytes)` });

  let erc165Base: boolean;
  let alfSupport: boolean;
  try {
    [erc165Base, alfSupport] = await Promise.all([
      supportsInterface(client, args.hook, IERC165_ID, atBlock),
      supportsInterface(client, args.hook, IALFHOOK_INTERFACE_ID, atBlock),
    ]);
  } catch (error) {
    warnings.push({
      code: "assess/partial-failures",
      message: `interface checks failed: ${errorMessage(error)}`,
    });
    evidence.push({ observed: `erc165 calls failed: ${errorMessage(error)}` });
    return { field: { status: "unverified", evidence }, codePresent: true };
  }
  evidence.push({ observed: `erc165(${IERC165_ID})=${erc165Base}` });
  evidence.push({ observed: `erc165(${IALFHOOK_INTERFACE_ID})=${alfSupport}` });
  if (!erc165Base || !alfSupport) {
    return { field: { status: "unsupported", evidence }, codePresent: true };
  }

  // Required IALFHook view surface: maxGas and isLive must be callable; when a
  // pool is given, its livePools view must answer too (liveness itself is the
  // quote service's concern — here we only establish a usable surface).
  try {
    const [maxGas, liveness] = await Promise.all([
      readMaxGas(client, args.hook, atBlock),
      readLiveness(client, args.hook, args.poolId ?? (("0x" + "0".repeat(64)) as Hex), atBlock),
    ]);
    evidence.push({ observed: `maxGas()=${maxGas}`, source: "IALFHook view surface" });
    evidence.push({ observed: `isLive()=${liveness.hookLive}`, source: "IALFHook view surface" });
    if (args.poolId !== undefined) {
      evidence.push({
        observed: `livePools(${args.poolId.slice(0, 10)}…)=${liveness.poolLive}`,
        source: "IALFHook view surface",
      });
    }
  } catch (error) {
    warnings.push({
      code: "assess/partial-failures",
      message: `required view calls failed: ${errorMessage(error)}`,
    });
    evidence.push({ observed: `view calls failed: ${errorMessage(error)}` });
    return { field: { status: "unverified", evidence }, codePresent: true };
  }
  return { field: { status: "supported", evidence }, codePresent: true };
}

async function assessProvenance(
  client: PublicClient,
  args: AssessOptions,
  atBlock: bigint,
  warnings: Warning[],
): Promise<AssessmentField<ProvenanceStatus>> {
  const evidence: AssessmentEvidence[] = [];
  if (args.fixture) {
    evidence.push({ observed: "explicit fixture input; no factory claim made" });
    return { status: "fixture", evidence };
  }
  const factory = args.factory ?? ALLOWLISTED_FACTORY;
  try {
    const [forward, reverse] = await Promise.all([
      factoryProvenance(client, factory, args.hook, atBlock),
      reverseProvenance(client, args.hook, factory, atBlock),
    ]);
    evidence.push({
      observed: `factory.isFromFactory=${forward.isFromFactory} creationCodeHash=${forward.creationCodeHash.slice(0, 10)}…`,
      source: "bytecode provenance only; never operator, vault, routing, or liveness safety",
    });
    evidence.push({
      observed: `hook.factory()=${reverse.reported} (matches=${reverse.matches})`,
    });
    return { status: forward.isFromFactory && reverse.matches ? "factory" : "unknown", evidence };
  } catch (error) {
    warnings.push({
      code: "assess/partial-failures",
      message: `provenance reads failed: ${errorMessage(error)}`,
    });
    evidence.push({ observed: `provenance reads failed: ${errorMessage(error)}` });
    return { status: "unknown", evidence };
  }
}

function assessRouting(args: AssessOptions): AssessmentField<RoutingStatus> {
  const evidence: AssessmentEvidence[] = [];
  const prefixTriggered = args.hook.toLowerCase().startsWith("0x91");
  evidence.push({
    observed: `address prefix ${args.hook.slice(0, 4)} (0x91 rule ${prefixTriggered ? "triggered" : "not triggered"})`,
    source: "current Uniswap Labs routing guidance",
  });
  if (prefixTriggered) {
    return { status: "manual-review", evidence };
  }

  if (args.poolKey === undefined) {
    evidence.push({
      observed: "no pool context supplied; pair and fee policy not evaluable",
      source: "hooklist is not the routing allowlist and is not consulted",
    });
    return { status: "unknown", evidence };
  }

  const dynamicFee = (args.poolKey.fee & DYNAMIC_FEE_FLAG) !== 0;
  evidence.push({ observed: `fee=${args.poolKey.fee} (dynamic-fee flag ${dynamicFee ? "set" : "clear"})` });
  if (dynamicFee) {
    return { status: "manual-review", evidence };
  }

  const majorPairs = args.majorPairs ?? ([[USDC, WETH] as MajorPair]);
  const pair = new Set([args.poolKey.currency0.toLowerCase(), args.poolKey.currency1.toLowerCase()]);
  const majorHit = majorPairs.some(
    (candidate) =>
      pair.has(candidate[0].toLowerCase()) && pair.has(candidate[1].toLowerCase()),
  );
  evidence.push({
    observed: `pair ${args.poolKey.currency0.slice(0, 8)}…/${args.poolKey.currency1.slice(0, 8)}… ${majorHit ? "is" : "is not"} in the configured major-pair policy`,
    source: "configured policy; recheck current guidance before relying on automatic",
  });
  return { status: majorHit ? "manual-review" : "automatic", evidence };
}

async function assessUpgradeability(
  client: PublicClient,
  args: AssessOptions,
  atBlock: bigint,
  codePresent: boolean | null,
  warnings: Warning[],
): Promise<AssessmentField<UpgradeabilityStatus>> {
  const evidence: AssessmentEvidence[] = [];
  if (codePresent === false) {
    evidence.push({ observed: "no runtime bytecode; proxy checks not evaluable" });
    return { status: "unverified", evidence };
  }
  try {
    const code = await client.getCode({
      address: args.hook,
      ...(atBlock !== undefined ? { blockNumber: atBlock } : {}),
    });
    if (code !== undefined && code.startsWith(EIP1167_PREFIX)) {
      evidence.push({ observed: `EIP-1167 minimal-proxy bytecode prefix ${EIP1167_PREFIX}` });
      return { status: "detected", evidence };
    }
    for (const [name, slot] of Object.entries(EIP1967_SLOTS)) {
      const value = await client.getStorageAt({
        address: args.hook,
        slot,
        ...(atBlock !== undefined ? { blockNumber: atBlock } : {}),
      });
      if (value !== "0x" + "0".repeat(64)) {
        evidence.push({ observed: `EIP-1967 ${name} slot ${slot.slice(0, 10)}… = ${value}` });
        return { status: "detected", evidence };
      }
      evidence.push({ observed: `EIP-1967 ${name} slot zero` });
    }
  } catch (error) {
    warnings.push({
      code: "assess/partial-failures",
      message: `proxy checks failed: ${errorMessage(error)}`,
    });
    evidence.push({ observed: `proxy checks failed: ${errorMessage(error)}` });
    return { status: "unverified", evidence };
  }

  evidence.push({
    observed: "EIP-1967 slots zero and no EIP-1167 prefix; these checks cannot prove immutability",
    source: "conservative proxy checks; unusual patterns remain possible",
  });
  return { status: "not-detected", evidence };
}

/**
 * Assess a hook across the four independent dimensions. Uncertainty is always
 * reported, never converted into a favorable result, and no combined verdict
 * exists anywhere in the output.
 */
export async function assessHook(
  client: PublicClient,
  args: AssessOptions,
): Promise<CommandResult<HookAssessment, AssessInput>> {
  const input: AssessInput = { hook: args.hook, ...(args.poolId !== undefined ? { poolId: args.poolId } : {}) };

  let chain: ChainBlockContext;
  {
    const guard = await assertMainnet(client, input, args.blockNumber);
    if ("error" in guard) return guard.error;
    chain = guard;
  }

  let atBlock: bigint;
  if (args.blockNumber !== undefined) {
    atBlock = args.blockNumber;
  } else {
    try {
      atBlock = await client.getBlockNumber();
      chain = { ...chain, blockNumber: atBlock, blockSource: "latest" };
    } catch (error) {
      return errorResult("assess", chain, input, {
        code: "assess/read-failed",
        message: `head block probe failed: ${errorMessage(error)}`,
      });
    }
  }
  const scoped = { ...args, blockNumber: atBlock };

  const warnings: Warning[] = [];
  const compatibility = await assessCompatibility(client, scoped, atBlock, warnings);
  const provenance = await assessProvenance(client, scoped, atBlock, warnings);
  const routing = assessRouting(scoped);
  if (routing.status === "unknown") {
    warnings.push({
      code: "assess/routing-policy-incomplete",
      message: "routing status unknown; supply a poolKey for pair and fee policy evaluation",
    });
  }
  const upgradeability = await assessUpgradeability(client, scoped, atBlock, compatibility.codePresent, warnings);

  return okResult(
    "assess",
    chain,
    input,
    { compatibility: compatibility.field, provenance, routing, upgradeability },
    warnings,
  );
}

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

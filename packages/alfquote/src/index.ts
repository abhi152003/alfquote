/**
 * Public surface of the `alfquote` library.
 *
 * This barrel is the only supported import path. Its exact export list is
 * pinned by `test/exports.test.ts`; extend it deliberately, never by
 * accident. Environment loading, console output, process exits, signers,
 * broadcasts, and Virtual-Environment admin access are out of the library
 * by contract (enforced by `scripts/check-package-boundaries.sh`).
 */

// --- Versioned command-result contracts ---------------------------------

export {
  RESULT_SCHEMA_VERSION,
  okResult,
  skipResult,
  errorResult,
  isOkResult,
  isSkipResult,
  isErrorResult,
  type CommandName,
  type ResultStatus,
  type ChainBlockContext,
  type Warning,
  type StructuredError,
  type SkipReason,
  type ResultEnvelope,
  type OkResult,
  type SkipResult,
  type ErrorResult,
  type CommandResult,
} from "./result.js";

// --- Structured hook assessment (independent fields, no combined `safe`) --

export {
  HOOK_ASSESSMENT_KEYS,
  type CompatibilityStatus,
  type ProvenanceStatus,
  type RoutingStatus,
  type UpgradeabilityStatus,
  type AssessmentEvidence,
  type AssessmentField,
  type HookAssessment,
  type HookAssessmentKey,
  type AssessInput,
} from "./assessment.js";

// --- Quote views ----------------------------------------------------------

export {
  type QuoteDirection,
  type QuoteInput,
  type IndicativeQuoteView,
  type EffectiveLiquidityView,
  type QuoteSkipCode,
} from "./quote.js";

// --- Protected swap construction and simulation ---------------------------

export {
  type SwapMode,
  type SwapInput,
  type ProtectedSwapPlan,
  type SwapSimulationOutcome,
} from "./swap.js";

// --- ABIs pinned from source ----------------------------------------------

export {
  erc165Abi,
  hookStatsAbi,
  alfHookAbi,
  factoryAbi,
  dualPoolHookViewsAbi,
  poolManagerAbi,
  erc20MetadataAbi,
  erc20Abi,
  permit2Abi,
  universalRouterAbi,
} from "./abis.js";

// --- Documented addresses and pinned fixture metadata ---------------------

export {
  ALLOWLISTED_FACTORY,
  POOL_MANAGER,
  UNIVERSAL_ROUTER,
  PERMIT2,
  FIXTURE_HOOK,
  FIXTURE_POOL_ID,
  V4_HOOKS_PUBLIC_REVISION,
  V4_CORE_REVISION,
  IALFHOOK_INTERFACE_ID,
  IHOOKSTATS_INTERFACE_ID,
  UPSTREAM_SOURCE,
  IALFHOOK_SOURCE_URL,
  IHOOKSTATS_SOURCE_URL,
  V4_CORE_STATE_LIBRARY_URL,
  USDC,
  USDT,
  PINNED_POOL_KEY,
  DEMO_POOL_INIT,
  POOL_MANAGER_BIRTH_BLOCK,
  FACTORY_BIRTH_BLOCK,
  FIXTURE_HOOK_BIRTH_BLOCK,
  FACTORY_REGISTRY_SNAPSHOT,
} from "./addresses.js";

// --- Pool identity and vanilla state ---------------------------------------

export {
  derivePoolId,
  poolStateSlot,
  decodeVanillaLiquidity,
  POOLS_SLOT,
  LIQUIDITY_OFFSET,
  type PoolKey,
} from "./pool.js";

export { readVanillaLiquidity } from "./poolState.js";
export { interfaceIdOf } from "./interfaceId.js";

// --- Hook views (IALFHook) -------------------------------------------------

export {
  readLiveness,
  readMaxGas,
  readHookStats,
  getIndicativeQuoteSafe,
  getIndicativeQuoteEncodedDiagnostic,
  type HookStatsResult,
  type IndicativeQuoteResult,
} from "./alfQuote.js";

// --- Discovery and provenance checks ---------------------------------------

export {
  hasBytecode,
  enumerateDeployments,
  factoryProvenance,
  type DeploymentRecord,
} from "./discovery.js";
export { reverseProvenance, supportsInterface } from "./hookChecks.js";

// --- ERC-20 reads and allowance snapshots ----------------------------------

export { readErc20Info, type Erc20Info } from "./erc20.js";
export { readSwapAllowances, allowanceBlockers, type AllowanceSnapshot } from "./allowances.js";

// --- Negative-liquidity proof ------------------------------------------------

export {
  decideProof,
  NEAR_ZERO_VANILLA_LIQUIDITY,
  type ProofDecision,
  type ProofSignals,
} from "./proofDecision.js";

// --- Universal Router v4 swap encoding ---------------------------------------

export {
  V4_SWAP_COMMAND,
  SWAP_EXACT_IN_SINGLE,
  SETTLE_ALL,
  TAKE_ALL,
  DEFAULT_SLIPPAGE_BPS,
  amountOutMinimumFromQuote,
  encodeV4ExactInSingleExecute,
  encodeExecuteCalldata,
  decodeV4ExactInSingleCalldata,
  type ExactInSingleSwap,
  type EncodedExecute,
  type UrEncoding,
  type DecodedV4ExactInSingle,
} from "./v4Swap.js";

// --- Read-only simulation -----------------------------------------------------

export {
  simulateUniversalRouterExecute,
  decodeRevert,
  decodeRevertData,
  classifyDecodedError,
  type SimulateSwapResult,
  type SimulateRevert,
} from "./simulateSwap.js";

export { runProtectedSimulation, quoteFillGapBps, type ProtectedSimRun } from "./protectedSim.js";

// --- Output redaction utilities (pure) -----------------------------------------

export { maskRpcUrl, redactKeys, redactRpcSecrets } from "./output.js";

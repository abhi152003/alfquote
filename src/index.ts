export {
  RPC_URL_ENV_VAR,
  SpikeConfigError,
  loadSpikeConfig,
  type SpikeConfig,
} from "./config.js";
export { createMainnetClient } from "./client.js";
export { interfaceIdOf } from "./interfaceId.js";
export {
  derivePoolId,
  poolStateSlot,
  decodeVanillaLiquidity,
  POOLS_SLOT,
  LIQUIDITY_OFFSET,
  type PoolKey,
} from "./pool.js";
export { readVanillaLiquidity } from "./poolState.js";
export { readErc20Info, type Erc20Info } from "./erc20.js";
export {
  readLiveness,
  readMaxGas,
  readHookStats,
  getIndicativeQuoteSafe,
  getIndicativeQuoteEncodedDiagnostic,
  type HookStatsResult,
  type IndicativeQuoteResult,
} from "./alfQuote.js";
export {
  decideProof,
  NEAR_ZERO_VANILLA_LIQUIDITY,
  type ProofDecision,
  type ProofSignals,
} from "./proofDecision.js";
export {
  AMOUNT_ENV_VAR,
  BLOCK_ENV_VAR,
  DEFAULT_AMOUNT_USDC,
  SWEEP_AMOUNTS_USDC,
  RunOptionsError,
  loadRunOptions,
  resolveBlockNumber,
  type RunOptions,
} from "./runOptions.js";
export { runProtectedSimulation, quoteFillGapBps, type ProtectedSimRun } from "./protectedSim.js";
export { maskRpcUrl, redactKeys } from "./output.js";
export {
  hasBytecode,
  enumerateDeployments,
  factoryProvenance,
  type DeploymentRecord,
} from "./discovery.js";
export { reverseProvenance, supportsInterface } from "./hookChecks.js";
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
export {
  DEFAULT_SLIPPAGE_BPS,
  amountOutMinimumFromQuote,
  encodeV4ExactInSingleExecute,
  encodeExecuteCalldata,
  decodeV4ExactInSingleCalldata,
  type EncodedExecute,
  type UrEncoding,
  type DecodedV4ExactInSingle,
} from "./v4Swap.js";
export { readSwapAllowances, allowanceBlockers, type AllowanceSnapshot } from "./allowances.js";
export {
  simulateUniversalRouterExecute,
  decodeRevertData,
  classifyDecodedError,
  type SimulateSwapResult,
} from "./simulateSwap.js";

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
  type PoolKey,
} from "./pool.js";
export { readVanillaLiquidity } from "./poolState.js";
export { readErc20Info, type Erc20Info } from "./erc20.js";
export {
  readLiveness,
  readMaxGas,
  readHookStats,
  getIndicativeQuoteSafe,
  type HookStatsResult,
  type IndicativeQuoteResult,
} from "./alfQuote.js";
export { decideProof, type ProofDecision, type ProofSignals } from "./proofDecision.js";
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
  UPSTREAM_SOURCE,
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
  type EncodedExecute,
  type UrEncoding,
} from "./v4Swap.js";
export { readSwapAllowances, allowanceBlockers, type AllowanceSnapshot } from "./allowances.js";
export { simulateUniversalRouterExecute, type SimulateSwapResult } from "./simulateSwap.js";

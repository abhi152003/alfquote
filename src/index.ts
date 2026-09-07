export {
  RPC_URL_ENV_VAR,
  SpikeConfigError,
  loadSpikeConfig,
  type SpikeConfig,
} from "./config.js";
export { createMainnetClient } from "./client.js";
export { interfaceIdOf } from "./interfaceId.js";
export { derivePoolId, type PoolKey } from "./pool.js";
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

import { parseAbi } from "viem";

/**
 * Typed runtime view of the pinned ABIs: viem's inference needs literal types,
 * which JSON module imports lose. The JSON files in src/abi/ stay canonical;
 * test/abiEquivalence.test.ts asserts both forms produce identical selectors.
 */

export const erc165Abi = parseAbi([
  "function supportsInterface(bytes4 interfaceId) view returns (bool)",
]);

export const hookStatsAbi = parseAbi([
  "function getReserves((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) key) view returns (uint256 token0, uint256 token1)",
  "function getEffectiveLiquidity((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) key) view returns (uint256 token0, uint256 token1)",
]);

export const alfHookAbi = parseAbi([
  "function getIndicativeQuote((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) key, bool zeroForOne, int256 amountSpecified, bytes hookData) view returns (uint256 outputAmount)",
  "function isLive() view returns (bool)",
  "function maxGas() view returns (uint32)",
  "function swapToPrice((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) key, bool zeroForOne, int256 amountSpecified, uint160 sqrtPriceLimitX96, bytes hookData) view returns (uint256 amountIn, uint256 amountOut)",
]);

export const factoryAbi = parseAbi([
  "event Deployed(address indexed deployed, bytes32 indexed creationCodeHash, address indexed deployer, bytes constructorArgs, bytes32 salt)",
  "function allDeployments(uint256 index) view returns (address deployed)",
  "function allDeploymentsLength() view returns (uint256)",
  "function isFromFactory(address deployed) view returns (bool)",
  "function creationCodeHashOf(address deployed) view returns (bytes32 creationCodeHash)",
  "function isAllowedCreationCode(bytes32 creationCodeHash) view returns (bool allowed)",
  "function computeAddress(bytes creationCode, bytes constructorArgs, bytes32 salt) view returns (address deployed)",
]);

export const dualPoolHookViewsAbi = parseAbi([
  "function factory() view returns (address)",
  "function livePools(bytes32 poolId) view returns (bool)",
]);

// Deployed mainnet signature; differs from v4-core main branch (docs/pins.md).
export const poolManagerAbi = parseAbi([
  "event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)",
  "function extsload(bytes32 slot) view returns (bytes32)",
]);

export const erc20MetadataAbi = parseAbi([
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
]);

import { encodeAbiParameters, keccak256 } from "viem";
import type { Address, Hex } from "viem";

/** v4 pool identity: currencies, fee, tick spacing, hook. */
export interface PoolKey {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
}

/** v4-core PoolId.toId: keccak256(abi.encode(key)). */
export function derivePoolId(key: PoolKey): Hex {
  const encoded = encodeAbiParameters(
    [
      { name: "currency0", type: "address" },
      { name: "currency1", type: "address" },
      { name: "fee", type: "uint24" },
      { name: "tickSpacing", type: "int24" },
      { name: "hooks", type: "address" },
    ],
    [key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks],
  );
  return keccak256(encoded);
}

/** `StateLibrary.POOLS_SLOT` — see docs/upstream/StateLibrary.excerpt.sol. */
export const POOLS_SLOT = 6n;

/** `StateLibrary.LIQUIDITY_OFFSET` — liquidity is word 3 of `Pool.State`. */
export const LIQUIDITY_OFFSET = 3n;

/** `pools[poolId]` slot: `keccak256(abi.encode(poolId, POOLS_SLOT))`. */
export function poolStateSlot(poolId: Hex): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { name: "poolId", type: "bytes32" },
        { name: "poolsSlot", type: "uint256" },
      ],
      [poolId, POOLS_SLOT],
    ),
  );
}

/** Low 128 bits of the liquidity storage word (`StateLibrary.getLiquidity`). */
export function decodeVanillaLiquidity(liquidityWord: Hex): bigint {
  return BigInt(liquidityWord) & ((1n << 128n) - 1n);
}

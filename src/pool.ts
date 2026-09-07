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

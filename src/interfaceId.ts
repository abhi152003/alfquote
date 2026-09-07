import { toFunctionSelector } from "viem";
import type { Abi, Hex } from "viem";

/**
 * ERC-165 interface id: XOR of the 4-byte selectors of an interface's own
 * functions (inherited functions excluded, matching `type(I).interfaceId`).
 */
export function interfaceIdOf(abi: Abi): Hex {
  let acc = 0n;
  for (const item of abi) {
    if (item.type !== "function") continue;
    acc ^= BigInt(toFunctionSelector(item));
  }
  return `0x${acc.toString(16).padStart(8, "0")}` as Hex;
}

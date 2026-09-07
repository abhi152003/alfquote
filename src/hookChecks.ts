import type { Address, Hex, PublicClient } from "viem";
import { erc165Abi, dualPoolHookViewsAbi } from "./abis.js";

/**
 * Reverse provenance: the hook's immutable `factory()` vs the documented
 * factory. A hook deployed outside the factory reports its actual creator,
 * so a mismatch is expected for fixtures, not an error.
 */
export async function reverseProvenance(
  client: PublicClient,
  hook: Address,
  expectedFactory: Address,
  blockNumber?: bigint,
): Promise<{ reported: Address; matches: boolean }> {
  const reported = await client.readContract({
    address: hook,
    abi: dualPoolHookViewsAbi,
    functionName: "factory",
    ...(blockNumber !== undefined ? { blockNumber } : {}),
  });
  return { reported, matches: reported.toLowerCase() === expectedFactory.toLowerCase() };
}

export async function supportsInterface(
  client: PublicClient,
  hook: Address,
  interfaceId: Hex,
  blockNumber?: bigint,
): Promise<boolean> {
  return client.readContract({
    address: hook,
    abi: erc165Abi,
    functionName: "supportsInterface",
    args: [interfaceId],
    ...(blockNumber !== undefined ? { blockNumber } : {}),
  });
}

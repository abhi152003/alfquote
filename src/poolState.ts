import { toHex } from "viem";
import type { Address, Hex, PublicClient } from "viem";
import { poolManagerAbi } from "./abis.js";
import { decodeVanillaLiquidity, LIQUIDITY_OFFSET, poolStateSlot } from "./pool.js";

/** Vanilla PoolManager liquidity via `extsload`, same as `StateLibrary.getLiquidity`. */
export async function readVanillaLiquidity(
  client: PublicClient,
  poolManager: Address,
  poolId: Hex,
  blockNumber: bigint,
): Promise<{ liquidity: bigint; slot0Word: Hex }> {
  const stateSlot = poolStateSlot(poolId);
  const liquiditySlot = toHex(BigInt(stateSlot) + LIQUIDITY_OFFSET, { size: 32 });
  const [slot0Word, liquidityWord] = await Promise.all([
    client.readContract({
      address: poolManager,
      abi: poolManagerAbi,
      functionName: "extsload",
      args: [stateSlot],
      blockNumber,
    }),
    client.readContract({
      address: poolManager,
      abi: poolManagerAbi,
      functionName: "extsload",
      args: [liquiditySlot],
      blockNumber,
    }),
  ]);
  return { liquidity: decodeVanillaLiquidity(liquidityWord), slot0Word };
}

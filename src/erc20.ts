import type { Address, PublicClient } from "viem";
import { erc20MetadataAbi } from "./abis.js";

export interface Erc20Info {
  symbol: string;
  decimals: number;
}

/** `symbol()` and `decimals()` at `blockNumber`. */
export async function readErc20Info(
  client: PublicClient,
  token: Address,
  blockNumber: bigint,
): Promise<Erc20Info> {
  const [symbol, decimals] = await Promise.all([
    client.readContract({
      address: token,
      abi: erc20MetadataAbi,
      functionName: "symbol",
      blockNumber,
    }),
    client.readContract({
      address: token,
      abi: erc20MetadataAbi,
      functionName: "decimals",
      blockNumber,
    }),
  ]);
  return { symbol, decimals: Number(decimals) };
}

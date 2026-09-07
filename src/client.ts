import { createPublicClient, http } from "viem";
import type { PublicClient } from "viem";
import type { SpikeConfig } from "./config.js";

/**
 * Mainnet-only public client: aborts on any chain other than 1, so the spike
 * can never record off-mainnet state as evidence.
 */
export async function createMainnetClient(config: SpikeConfig): Promise<PublicClient> {
  const client = createPublicClient({
    transport: http(config.rpcUrl),
  });

  const chainId = await client.getChainId();
  if (chainId !== 1) {
    throw new Error(
      `RPC endpoint reported chain id ${chainId}, expected 1 (Ethereum mainnet). ` +
        "Point ETHEREUM_RPC_URL at a mainnet endpoint.",
    );
  }
  return client;
}

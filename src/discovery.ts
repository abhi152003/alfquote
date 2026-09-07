import type { Address, Hex, PublicClient } from "viem";
import { factoryAbi } from "./abis.js";

export interface DeploymentRecord {
  address: Address;
  index: number;
}

/** Non-empty runtime bytecode at `address`. viem returns undefined for empty code, not "0x". */
export async function hasBytecode(
  client: PublicClient,
  address: Address,
  blockNumber?: bigint,
): Promise<{ present: boolean; size: number }> {
  const code = await client.getCode({
    address,
    ...(blockNumber !== undefined ? { blockNumber } : {}),
  });
  const present = code !== undefined && code !== "0x";
  return { present, size: present ? (code.length - 2) / 2 : 0 };
}

/** Enumerate the factory registry: allDeploymentsLength + allDeployments(i). */
export async function enumerateDeployments(
  client: PublicClient,
  factory: Address,
  blockNumber?: bigint,
): Promise<DeploymentRecord[]> {
  const atBlock = blockNumber !== undefined ? { blockNumber } : {};
  const length = await client.readContract({
    address: factory,
    abi: factoryAbi,
    functionName: "allDeploymentsLength",
    ...atBlock,
  });
  const deployments: DeploymentRecord[] = [];
  for (let i = 0n; i < length; i++) {
    const deployed = await client.readContract({
      address: factory,
      abi: factoryAbi,
      functionName: "allDeployments",
      args: [i],
      ...atBlock,
    });
    deployments.push({ address: deployed, index: Number(i) });
  }
  return deployments;
}

/** Forward provenance: factory-side attestation for a hook address. */
export async function factoryProvenance(
  client: PublicClient,
  factory: Address,
  hook: Address,
  blockNumber?: bigint,
): Promise<{ isFromFactory: boolean; creationCodeHash: Hex }> {
  const atBlock = blockNumber !== undefined ? { blockNumber } : {};
  const [isFromFactory, creationCodeHash] = await Promise.all([
    client.readContract({
      address: factory,
      abi: factoryAbi,
      functionName: "isFromFactory",
      args: [hook],
      ...atBlock,
    }),
    client.readContract({
      address: factory,
      abi: factoryAbi,
      functionName: "creationCodeHashOf",
      args: [hook],
      ...atBlock,
    }),
  ]);
  return { isFromFactory, creationCodeHash };
}

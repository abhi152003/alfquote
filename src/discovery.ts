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
): Promise<{ present: boolean; size: number }> {
  const code = await client.getCode({ address });
  const present = code !== undefined && code !== "0x";
  return { present, size: present ? (code.length - 2) / 2 : 0 };
}

/** Enumerate the factory registry: allDeploymentsLength + allDeployments(i). */
export async function enumerateDeployments(
  client: PublicClient,
  factory: Address,
): Promise<DeploymentRecord[]> {
  const length = await client.readContract({
    address: factory,
    abi: factoryAbi,
    functionName: "allDeploymentsLength",
  });
  const deployments: DeploymentRecord[] = [];
  for (let i = 0n; i < length; i++) {
    const deployed = await client.readContract({
      address: factory,
      abi: factoryAbi,
      functionName: "allDeployments",
      args: [i],
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
): Promise<{ isFromFactory: boolean; creationCodeHash: Hex }> {
  const [isFromFactory, creationCodeHash] = await Promise.all([
    client.readContract({
      address: factory,
      abi: factoryAbi,
      functionName: "isFromFactory",
      args: [hook],
    }),
    client.readContract({
      address: factory,
      abi: factoryAbi,
      functionName: "creationCodeHashOf",
      args: [hook],
    }),
  ]);
  return { isFromFactory, creationCodeHash };
}

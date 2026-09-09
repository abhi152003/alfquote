import type { Address, PublicClient } from "viem";
import { erc20Abi, permit2Abi } from "./abis.js";

export interface AllowanceSnapshot {
  token: Address;
  sender: Address;
  balance: bigint;
  erc20ToPermit2: bigint;
  permit2ToRouter: { amount: bigint; expiration: bigint; nonce: bigint };
}

export async function readSwapAllowances(
  client: PublicClient,
  args: { token: Address; sender: Address; permit2: Address; router: Address; blockNumber: bigint },
): Promise<AllowanceSnapshot> {
  const [balance, erc20ToPermit2, permit2ToRouter] = await Promise.all([
    client.readContract({
      address: args.token,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [args.sender],
      blockNumber: args.blockNumber,
    }),
    client.readContract({
      address: args.token,
      abi: erc20Abi,
      functionName: "allowance",
      args: [args.sender, args.permit2],
      blockNumber: args.blockNumber,
    }),
    client.readContract({
      address: args.permit2,
      abi: permit2Abi,
      functionName: "allowance",
      args: [args.sender, args.token, args.router],
      blockNumber: args.blockNumber,
    }),
  ]);
  return {
    token: args.token,
    sender: args.sender,
    balance,
    erc20ToPermit2,
    permit2ToRouter: {
      amount: BigInt(permit2ToRouter[0]),
      expiration: BigInt(permit2ToRouter[1]),
      nonce: BigInt(permit2ToRouter[2]),
    },
  };
}

export function allowanceBlockers(
  snap: AllowanceSnapshot,
  amountIn: bigint,
  nowSeconds: bigint,
): string[] {
  const blockers: string[] = [];
  if (snap.balance < amountIn) {
    blockers.push(`sender balance of ${snap.token} is ${snap.balance} < amountIn ${amountIn}`);
  }
  if (snap.erc20ToPermit2 < amountIn) {
    blockers.push(`ERC-20 allowance to Permit2 ${snap.erc20ToPermit2} < amountIn ${amountIn}`);
  }
  if (snap.permit2ToRouter.amount < amountIn) {
    blockers.push(`Permit2 allowance to Universal Router ${snap.permit2ToRouter.amount} < amountIn ${amountIn}`);
  }
  if (snap.permit2ToRouter.expiration === 0n || snap.permit2ToRouter.expiration < nowSeconds) {
    blockers.push(`Permit2 allowance expired at ${snap.permit2ToRouter.expiration}`);
  }
  return blockers;
}

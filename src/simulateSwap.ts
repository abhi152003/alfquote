import { BaseError, ContractFunctionRevertedError, decodeErrorResult, parseAbi } from "viem";
import type { Address, Hex, PublicClient } from "viem";
import { universalRouterAbi } from "./abis.js";
import { UNIVERSAL_ROUTER } from "./addresses.js";

export const REVERT_ERROR_ABI = parseAbi([
  "error V4TooLittleReceived(uint256,uint256)",
  "error AllowanceExpired(uint256)",
  "error InsufficientAllowance(uint256)",
  "error InsufficientBalance(uint256)",
  "error ExecutionFailed(uint256 commandIndex, bytes message)",
  "error TransactionDeadlinePassed()",
]);

const CORRECTABLE_ERRORS = new Set([
  "AllowanceExpired",
  "InsufficientAllowance",
  "InsufficientBalance",
]);

export interface SimulateSwapResult {
  ok: boolean;
  gas?: bigint;
  revert?: { name: string; shortMessage: string; data?: Hex; correctable: boolean };
}

export function classifyDecodedError(name: string): boolean {
  return CORRECTABLE_ERRORS.has(name);
}

export function decodeRevertData(raw: Hex): { name: string; shortMessage: string; correctable: boolean } {
  const parsed = decodeErrorResult({ abi: REVERT_ERROR_ABI, data: raw });
  if (parsed.errorName === "ExecutionFailed") {
    const inner = parsed.args[1] as Hex;
    try {
      const nested = decodeErrorResult({ abi: REVERT_ERROR_ABI, data: inner });
      return {
        name: nested.errorName,
        shortMessage: `ExecutionFailed(${parsed.args[0]}, ${nested.errorName}(${nested.args.map(String).join(", ")}))`,
        correctable: classifyDecodedError(nested.errorName),
      };
    } catch {
      return {
        name: "ExecutionFailed",
        shortMessage: `ExecutionFailed(${parsed.args[0]}, ${inner})`,
        correctable: false,
      };
    }
  }
  return {
    name: parsed.errorName,
    shortMessage: `${parsed.errorName}(${parsed.args.map(String).join(", ")})`,
    correctable: classifyDecodedError(parsed.errorName),
  };
}

export async function simulateUniversalRouterExecute(
  client: PublicClient,
  args: {
    sender: Address;
    commands: Hex;
    inputs: readonly Hex[];
    deadline: bigint;
    blockNumber?: bigint;
  },
): Promise<SimulateSwapResult> {
  try {
    const { request } = await client.simulateContract({
      address: UNIVERSAL_ROUTER,
      abi: universalRouterAbi,
      functionName: "execute",
      args: [args.commands, [...args.inputs], args.deadline],
      account: args.sender,
      ...(args.blockNumber !== undefined ? { blockNumber: args.blockNumber } : {}),
    });
    const gas = await client.estimateContractGas(request);
    return { ok: true, gas };
  } catch (error) {
    return { ok: false, revert: decodeRevert(error) };
  }
}

export function decodeRevert(error: unknown): NonNullable<SimulateSwapResult["revert"]> {
  const walked =
    error instanceof BaseError
      ? error.walk((err) => err instanceof ContractFunctionRevertedError)
      : undefined;
  const reverted = walked instanceof ContractFunctionRevertedError ? walked : undefined;
  const shortMessage =
    error instanceof BaseError
      ? error.shortMessage
      : error instanceof Error
        ? error.message
        : String(error);
  const rawData = (reverted?.raw ?? undefined) as Hex | undefined;
  if (rawData) {
    try {
      const decoded = decodeRevertData(rawData);
      return { ...decoded, data: rawData };
    } catch {
      return {
        name: "Unknown",
        shortMessage: shortMessage.slice(0, 400),
        data: rawData,
        correctable: false,
      };
    }
  }
  return {
    name: "Unknown",
    shortMessage: shortMessage.slice(0, 400),
    correctable: false,
  };
}

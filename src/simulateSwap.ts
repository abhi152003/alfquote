import { BaseError, ContractFunctionRevertedError, decodeErrorResult, parseAbi } from "viem";
import type { Address, Hex, PublicClient } from "viem";
import { universalRouterAbi } from "./abis.js";
import { UNIVERSAL_ROUTER } from "./addresses.js";

const revertAbi = parseAbi([
  "error V4TooLittleReceived(uint256,uint256)",
  "error AllowanceExpired(uint256)",
  "error InsufficientAllowance(uint256)",
  "error ExecutionFailed(uint256 commandIndex, bytes message)",
  "error TransactionDeadlinePassed()",
]);

export interface SimulateSwapResult {
  ok: boolean;
  gas?: bigint;
  revert?: { shortMessage: string; data?: Hex; correctable: boolean };
}

const CORRECTABLE = /allowance|insufficient|transfer|balance|permit2|expired|STF|TRANSFER_FROM/i;

export async function simulateUniversalRouterExecute(
  client: PublicClient,
  args: { sender: Address; commands: Hex; inputs: readonly Hex[]; deadline: bigint },
): Promise<SimulateSwapResult> {
  try {
    const { request } = await client.simulateContract({
      address: UNIVERSAL_ROUTER,
      abi: universalRouterAbi,
      functionName: "execute",
      args: [args.commands, [...args.inputs], args.deadline],
      account: args.sender,
    });
    const gas = await client.estimateContractGas(request);
    return { ok: true, gas };
  } catch (error) {
    const revert = decodeRevert(error);
    return { ok: false, revert };
  }
}

function decodeRevert(error: unknown): SimulateSwapResult["revert"] {
  const data =
    error instanceof BaseError
      ? error.walk((err) => err instanceof ContractFunctionRevertedError)
      : undefined;
  const reverted = data instanceof ContractFunctionRevertedError ? data : undefined;
  const shortMessage =
    error instanceof BaseError
      ? error.shortMessage
      : error instanceof Error
        ? error.message
        : String(error);
  const errorName = reverted?.data && "errorName" in reverted.data ? String(reverted.data.errorName) : undefined;
  const rawData = (reverted?.raw ?? undefined) as Hex | undefined;
  let decoded = errorName ?? shortMessage;
  if (rawData) {
    try {
      const parsed = decodeErrorResult({ abi: revertAbi, data: rawData });
      decoded = `${parsed.errorName}(${parsed.args.map(String).join(", ")})`;
    } catch {
      decoded = `${decoded} raw=${rawData.slice(0, 74)}`;
    }
  }
  return {
    shortMessage: decoded.slice(0, 400),
    data: rawData,
    correctable: CORRECTABLE.test(decoded) || CORRECTABLE.test(shortMessage),
  };
}

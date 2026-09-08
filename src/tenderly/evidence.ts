/**
 * Machine-readable controlled-fork evidence (WO-7). The Admin RPC URL (and any
 * path secrets in the public URL) must never appear in the evidence file or in
 * exported submission artifacts — `assertNoEndpointSecrets` enforces that.
 */

import { maskTenderlyUrl } from "./config.js";
import type { TenderlyConfig } from "./config.js";
import type { SetupRecords } from "./forkSetup.js";
import type { ForkSwapRun } from "./forkSwap.js";
import type { ForkVerification } from "./forkVerify.js";

export interface ForkEvidence {
  proofType: "controlled-fork-execution";
  disclaimer: string;
  recordedAtUtc: string;
  forkBlock: bigint;
  forkChainId: number;
  forkHeadAtVerification: bigint;
  originCheck: ForkVerification["originCheck"];
  publicEndpoint: string;
  testAddress: string;
  poolId: string;
  verification: {
    bytecodeMatches: ForkVerification["bytecodeMatches"];
    poolStateMatch: boolean;
    poolIdOffline: string;
    adminProbeLatestBlock: ForkVerification["latestBlockInfo"];
  };
  setup: {
    funding: SetupRecords["funding"];
    approvals: SetupRecords["approvals"];
    storageOverrides: SetupRecords["overrides"];
  };
  swap: {
    amountIn: bigint;
    quotedOutput: bigint;
    slippageBps: bigint;
    amountOutMinimum: bigint;
    quoteBlock: bigint;
    deadline: bigint;
    txHash: string;
    receiptStatus: string;
    receiptBlock: bigint;
    gasUsed: bigint;
    actualOut: bigint;
    transfersToUserFromLogs: bigint;
    usdcSpent: bigint;
    poolManagerSwapObserved: boolean;
    hookModifyLiquidityEvents: number;
    commands: string;
    actions: string;
    calldata: string;
    /** Raw receipt logs — the recorded execution trace (addresses, topics, data). */
    receiptLogs: ReadonlyArray<{ address: string; topics: readonly string[]; data: string }>;
    pass: boolean;
    failure?: string;
  };
  evidenceLink?: string;
}

export const CONTROLLED_FORK_DISCLAIMER =
  "Executed on a Tenderly Virtual Environment fork of Ethereum mainnet with injected balances and approvals. Not an Ethereum mainnet transaction.";

export function buildForkEvidence(args: {
  config: TenderlyConfig;
  verification: ForkVerification;
  setup: SetupRecords;
  swap: ForkSwapRun;
  poolId: string;
  recordedAtUtc?: string;
  evidenceLink?: string;
}): ForkEvidence {
  return {
    proofType: "controlled-fork-execution",
    disclaimer: CONTROLLED_FORK_DISCLAIMER,
    recordedAtUtc: args.recordedAtUtc ?? new Date().toISOString(),
    forkBlock: args.config.forkBlock,
    forkChainId: args.verification.chainId,
    forkHeadAtVerification: args.verification.forkHead,
    originCheck: args.verification.originCheck,
    publicEndpoint: maskTenderlyUrl(args.config.publicRpcUrl),
    testAddress: args.config.from,
    poolId: args.poolId,
    verification: {
      bytecodeMatches: args.verification.bytecodeMatches,
      poolStateMatch: args.verification.poolStateMatch,
      poolIdOffline: args.verification.poolIdOffline,
      adminProbeLatestBlock: args.verification.latestBlockInfo,
    },
    setup: {
      funding: args.setup.funding,
      approvals: args.setup.approvals,
      storageOverrides: args.setup.overrides,
    },
    swap: {
      amountIn: args.swap.amountIn,
      quotedOutput: args.swap.quote,
      slippageBps: args.swap.slippageBps,
      amountOutMinimum: args.swap.amountOutMinimum,
      quoteBlock: args.swap.quoteBlock,
      deadline: args.swap.deadline,
      txHash: args.swap.tx,
      receiptStatus: args.swap.receipt.status,
      receiptBlock: args.swap.receipt.blockNumber,
      gasUsed: args.swap.receipt.gasUsed,
      actualOut: args.swap.actualOut,
      transfersToUserFromLogs: args.swap.transfersToUserFromLogs,
      usdcSpent: args.swap.usdcSpent,
      poolManagerSwapObserved: args.swap.poolManagerSwapObserved,
      hookModifyLiquidityEvents: args.swap.hookModifyLiquidityEvents,
      commands: args.swap.encoded.commands,
      actions: args.swap.encoded.actions,
      calldata: args.swap.encoded.calldata,
      receiptLogs: args.swap.receipt.logs,
      pass: args.swap.pass,
      ...(args.swap.failure !== undefined ? { failure: args.swap.failure } : {}),
    },
    ...(args.evidenceLink !== undefined ? { evidenceLink: args.evidenceLink } : {}),
  };
}

/**
 * Fail closed if serialized evidence contains any endpoint URL or its path.
 * Run before writing or exporting evidence.
 */
export function assertNoEndpointSecrets(serialized: string, config: TenderlyConfig): void {
  const forbidden: string[] = [];
  for (const url of [config.adminRpcUrl, config.publicRpcUrl]) {
    if (serialized.includes(url)) {
      forbidden.push(maskTenderlyUrl(url));
      continue;
    }
    try {
      const path = new URL(url).pathname;
      if (path !== "/" && serialized.includes(path)) {
        forbidden.push(`${maskTenderlyUrl(url)} (path)`);
      }
    } catch {
      // Unparseable URLs are rejected by config validation already.
    }
  }
  if (forbidden.length > 0) {
    throw new Error(`Evidence contains a Tenderly endpoint secret: ${forbidden.join(", ")}. Refusing to export.`);
  }
}

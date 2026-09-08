/** Machine-readable controlled-fork evidence with strict release validation. */

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
  forkOriginBlockHash: string;
  mainnetOriginBlockHash: string;
  /** VEs re-seal blocks, so hashes are recorded identifiers, not an equality check. */
  originStatsMatch: boolean;
  publicEndpoint: string;
  testAddress: string;
  poolId: string;
  verification: {
    bytecodeMatches: ForkVerification["bytecodeMatches"];
    poolStateMatch: boolean;
    poolIdOffline: string;
    originStats: { fork: ForkVerification["originStatsFork"]; mainnet: ForkVerification["originStatsMainnet"] };
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
    decodedEvents: ForkSwapRun["events"];
    receiptLogs: ReadonlyArray<{ address: string; topics: readonly string[]; data: string }>;
    pass: boolean;
    failure?: string;
  };
  evidenceLink?: string;
}

export const CONTROLLED_FORK_DISCLAIMER =
  "Executed on a Tenderly Virtual Environment fork of Ethereum mainnet with injected balances and approvals. Not an Ethereum mainnet transaction.";

export class ForkEvidenceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForkEvidenceValidationError";
  }
}

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
    forkOriginBlockHash: args.verification.forkOriginBlockHash,
    mainnetOriginBlockHash: args.verification.mainnetOriginBlockHash,
    originStatsMatch: args.verification.originStatsMatch,
    publicEndpoint: maskTenderlyUrl(args.config.publicRpcUrl),
    testAddress: args.config.from,
    poolId: args.poolId,
    verification: {
      bytecodeMatches: args.verification.bytecodeMatches,
      poolStateMatch: args.verification.poolStateMatch,
      poolIdOffline: args.verification.poolIdOffline,
      originStats: { fork: args.verification.originStatsFork, mainnet: args.verification.originStatsMainnet },
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
      decodedEvents: args.swap.events,
      receiptLogs: args.swap.receipt.logs,
      pass: args.swap.pass,
      ...(args.swap.failure !== undefined ? { failure: args.swap.failure } : {}),
    },
    ...(args.evidenceLink !== undefined ? { evidenceLink: args.evidenceLink } : {}),
  };
}

export function validateReleaseEvidence(evidence: ForkEvidence): void {
  const failures: string[] = [];
  const validHash = (hash: string) => /^0x[0-9a-fA-F]{64}$/.test(hash);
  if (!validHash(evidence.forkOriginBlockHash) || !validHash(evidence.mainnetOriginBlockHash)) failures.push("origin block hash identifiers are missing");
  if (!evidence.originStatsMatch) failures.push("DualPool reserves/effective-liquidity at the origin block do not match mainnet");
  if (!evidence.verification.poolStateMatch) failures.push("pool state does not match mainnet");
  if (!evidence.verification.bytecodeMatches.every((entry) => entry.match)) failures.push("contract bytecode fingerprint is incomplete");
  const fundingKinds = new Set(evidence.setup.funding.map((record) => record.kind));
  if (!fundingKinds.has("fund-native") || !fundingKinds.has("fund-erc20")) failures.push("fresh-run funding identifiers are missing");
  const approvalKinds = new Set(evidence.setup.approvals.map((record) => record.kind));
  if (!approvalKinds.has("approve-erc20-permit2") || !approvalKinds.has("approve-permit2-router")) failures.push("normal approval transactions are missing");
  if (evidence.setup.funding.some((record) => record.kind === "fund-skipped") || evidence.setup.approvals.some((record) => record.kind === "approve-skipped")) failures.push("release evidence contains skipped setup records");
  if (evidence.setup.storageOverrides.length > 0) failures.push("release evidence used a storage override");
  if (!evidence.swap.pass || evidence.swap.receiptStatus !== "success") failures.push("protected swap did not succeed");
  if (evidence.swap.actualOut < evidence.swap.amountOutMinimum) failures.push("actual output is below minimum output");
  if (evidence.swap.actualOut !== evidence.swap.transfersToUserFromLogs) failures.push("output measurements do not reconcile");
  if (evidence.swap.usdcSpent !== evidence.swap.amountIn) failures.push("input spend does not reconcile");
  if (!evidence.swap.poolManagerSwapObserved || evidence.swap.hookModifyLiquidityEvents === 0) failures.push("required swap or hook evidence is missing");
  if (evidence.swap.receiptLogs.length === 0 || evidence.swap.decodedEvents.length === 0) failures.push("exported execution trace is empty");
  if (!evidence.evidenceLink) failures.push("public/read-only Tenderly evidence link is missing");
  else {
    try {
      const link = new URL(evidence.evidenceLink);
      if (link.protocol !== "https:") failures.push("evidence link must use https");
    } catch {
      failures.push("evidence link is not a valid URL");
    }
  }
  if (failures.length > 0) throw new ForkEvidenceValidationError(failures.join("; "));
}

export function assertNoEndpointSecrets(serialized: string, config: TenderlyConfig): void {
  const forbidden: string[] = [];
  for (const url of [config.adminRpcUrl, config.publicRpcUrl]) {
    if (serialized.includes(url)) {
      forbidden.push(maskTenderlyUrl(url));
      continue;
    }
    try {
      const path = new URL(url).pathname;
      if (path !== "/" && serialized.includes(path)) forbidden.push(`${maskTenderlyUrl(url)} (path)`);
    } catch {
      // Config validation rejects malformed URLs.
    }
  }
  if (forbidden.length > 0) throw new Error(`Evidence contains a Tenderly endpoint secret: ${forbidden.join(", ")}. Refusing to export.`);
}

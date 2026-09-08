/**
 * Controlled-fork setup (WO-7): funding via documented Tenderly admin
 * cheatcodes, then ERC-20 → Permit2 → Universal Router approvals as normal
 * contract transactions (unsigned `eth_sendTransaction`). Funding, approvals,
 * and the tested swap are recorded as separate evidence sections. A raw storage
 * override exists only as a disclosed fallback and is never on the default path.
 */

import { concatHex, encodeAbiParameters, toFunctionSelector } from "viem";
import type { AbiParameter, Address, Hex } from "viem";
import { PERMIT2, UNIVERSAL_ROUTER, USDC } from "../addresses.js";
import type { TenderlyConfig } from "./config.js";
import type { TenderlyAdmin } from "./adminClient.js";

export class ForkSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForkSetupError";
  }
}

export const FUND_ETH_WEI = 10n ** 18n;
export const MIN_FUND_USDC = 100_000_000n;
const MAX_UINT256 = 2n ** 256n - 1n;
const MAX_UINT160 = 2n ** 160n - 1n;
export const PERMIT2_EXPIRATION_SECONDS = 7n * 24n * 60n * 60n;

const USDC_APPROVE_SELECTOR = toFunctionSelector("approve(address,uint256)");
const PERMIT2_APPROVE_SELECTOR = toFunctionSelector("approve(address,address,uint160,uint48)");

const ERC20_APPROVE_PARAMS: readonly AbiParameter[] = [
  { name: "spender", type: "address" },
  { name: "amount", type: "uint256" },
];

const PERMIT2_APPROVE_PARAMS: readonly AbiParameter[] = [
  { name: "token", type: "address" },
  { name: "spender", type: "address" },
  { name: "amount", type: "uint160" },
  { name: "expiration", type: "uint48" },
];

function encodeUsdcApprove(spender: Address, amount: bigint): Hex {
  return concatHex([USDC_APPROVE_SELECTOR, encodeAbiParameters(ERC20_APPROVE_PARAMS, [spender, amount])]);
}

function encodePermit2Approve(token: Address, spender: Address, amount: bigint, expiration: bigint): Hex {
  return concatHex([
    PERMIT2_APPROVE_SELECTOR,
    encodeAbiParameters(PERMIT2_APPROVE_PARAMS, [token, spender, amount, expiration]),
  ]);
}

export interface ForkReceipt {
  hash: Hex;
  status: "success" | "reverted";
  gasUsed: bigint;
  blockNumber: bigint;
  logs: ReadonlyArray<{ address: Address; topics: readonly Hex[]; data: Hex }>;
}

/** Narrow read surface over the fork's public RPC; injectable for tests. */
export interface ForkReader {
  erc20Balance(token: Address, owner: Address): Promise<bigint>;
  nativeBalance(address: Address): Promise<bigint>;
  erc20Allowance(token: Address, owner: Address, spender: Address): Promise<bigint>;
  permit2Allowance(owner: Address, token: Address, spender: Address): Promise<{ amount: bigint; expiration: bigint }>;
  storageAt(contract: Address, slot: Hex): Promise<Hex>;
  waitForReceipt(hash: Hex): Promise<ForkReceipt>;
}

export type FundingRecord =
  | { kind: "fund-native"; method: "tenderly_setBalance"; address: Address; amountWei: bigint; result: Hex }
  | { kind: "fund-erc20"; method: "tenderly_addErc20Balance"; token: Address; address: Address; amount: bigint; result: Hex }
  | { kind: "fund-skipped"; which: "native" | "erc20"; reason: string };

export type ApprovalRecord =
  | {
      kind: "approve-erc20-permit2";
      token: Address;
      owner: Address;
      spender: Address;
      amount: bigint;
      tx: Hex;
      status: "success";
      gasUsed: bigint;
      blockNumber: bigint;
      verificationRead: bigint;
    }
  | {
      kind: "approve-permit2-router";
      permit2: Address;
      token: Address;
      owner: Address;
      spender: Address;
      amount: bigint;
      expiration: bigint;
      tx: Hex;
      status: "success";
      gasUsed: bigint;
      blockNumber: bigint;
      verificationRead: { amount: bigint; expiration: bigint };
    }
  | { kind: "approve-skipped"; which: "erc20-permit2" | "permit2-router"; reason: string };

export interface StorageOverrideRecord {
  kind: "storage-override";
  contract: Address;
  slot: Hex;
  oldValue: Hex;
  newValue: Hex;
  reason: string;
  verificationRead: Hex;
  result: Hex;
}

export interface SetupRecords {
  config: TenderlyConfig;
  funding: FundingRecord[];
  approvals: ApprovalRecord[];
  overrides: StorageOverrideRecord[];
}

/** USDC funding covers the tested size four times over, or 100 USDC, whichever is larger. */
export function planUsdcFunding(amountIn: bigint): bigint {
  const bySize = amountIn * 4n;
  return bySize > MIN_FUND_USDC ? bySize : MIN_FUND_USDC;
}

async function sendAndWait(
  admin: TenderlyAdmin,
  reader: ForkReader,
  label: string,
  tx: { to: Address; data: Hex },
  from: Address,
): Promise<ForkReceipt> {
  const hash = await admin.sendUnsignedTransaction({ from, to: tx.to, data: tx.data, value: 0n });
  const receipt = await reader.waitForReceipt(hash);
  if (receipt.status !== "success") {
    throw new ForkSetupError(`${label} transaction ${hash} reverted on the Virtual Environment.`);
  }
  return { ...receipt, hash };
}

export async function runForkSetup(
  admin: TenderlyAdmin,
  reader: ForkReader,
  args: { config: TenderlyConfig; amountIn: bigint; now: bigint },
): Promise<SetupRecords> {
  const { config, amountIn, now } = args;
  const records: SetupRecords = { config, funding: [], approvals: [], overrides: [] };

  const native = await reader.nativeBalance(config.from);
  if (native < FUND_ETH_WEI) {
    const result = await admin.setBalance(config.from, FUND_ETH_WEI);
    records.funding.push({ kind: "fund-native", method: "tenderly_setBalance", address: config.from, amountWei: FUND_ETH_WEI, result });
  } else {
    records.funding.push({
      kind: "fund-skipped",
      which: "native",
      reason: `existing native balance ${native} wei already covers the setup gas budget ${FUND_ETH_WEI}`,
    });
  }

  const usdcBalance = await reader.erc20Balance(USDC, config.from);
  if (usdcBalance < amountIn * 2n) {
    const amount = planUsdcFunding(amountIn);
    const result = await admin.addErc20Balance(USDC, config.from, amount);
    records.funding.push({ kind: "fund-erc20", method: "tenderly_addErc20Balance", token: USDC, address: config.from, amount, result });
  } else {
    records.funding.push({
      kind: "fund-skipped",
      which: "erc20",
      reason: `existing USDC balance ${usdcBalance} already covers twice amountIn ${amountIn}`,
    });
  }

  const erc20Allowance = await reader.erc20Allowance(USDC, config.from, PERMIT2);
  if (erc20Allowance >= amountIn) {
    records.approvals.push({
      kind: "approve-skipped",
      which: "erc20-permit2",
      reason: `existing allowance ${erc20Allowance} already covers amountIn ${amountIn}`,
    });
  } else {
    const data = encodeUsdcApprove(PERMIT2, MAX_UINT256);
    const receipt = await sendAndWait(admin, reader, "USDC approve(Permit2)", { to: USDC, data }, config.from);
    const verificationRead = await reader.erc20Allowance(USDC, config.from, PERMIT2);
    if (verificationRead < amountIn) {
      throw new ForkSetupError(`USDC approve succeeded but allowance read-back ${verificationRead} < ${amountIn}.`);
    }
    records.approvals.push({
      kind: "approve-erc20-permit2",
      token: USDC,
      owner: config.from,
      spender: PERMIT2,
      amount: MAX_UINT256,
      tx: receipt.hash,
      status: "success",
      gasUsed: receipt.gasUsed,
      blockNumber: receipt.blockNumber,
      verificationRead,
    });
  }

  const permit2 = await reader.permit2Allowance(config.from, USDC, UNIVERSAL_ROUTER);
  const minExpiration = now + 60n * 60n;
  if (permit2.amount >= amountIn && permit2.expiration >= minExpiration) {
    records.approvals.push({
      kind: "approve-skipped",
      which: "permit2-router",
      reason: `existing allowance ${permit2.amount} / expiration ${permit2.expiration} already covers amountIn ${amountIn}`,
    });
  } else {
    const expiration = now + PERMIT2_EXPIRATION_SECONDS;
    const data = encodePermit2Approve(USDC, UNIVERSAL_ROUTER, MAX_UINT160, expiration);
    const receipt = await sendAndWait(admin, reader, "Permit2 approve(UniversalRouter)", { to: PERMIT2, data }, config.from);
    const verificationRead = await reader.permit2Allowance(config.from, USDC, UNIVERSAL_ROUTER);
    if (verificationRead.amount < amountIn || verificationRead.expiration < minExpiration) {
      throw new ForkSetupError(
        `Permit2 approve succeeded but read-back ${verificationRead.amount} / ${verificationRead.expiration} is insufficient.`,
      );
    }
    records.approvals.push({
      kind: "approve-permit2-router",
      permit2: PERMIT2,
      token: USDC,
      owner: config.from,
      spender: UNIVERSAL_ROUTER,
      amount: MAX_UINT160,
      expiration,
      tx: receipt.hash,
      status: "success",
      gasUsed: receipt.gasUsed,
      blockNumber: receipt.blockNumber,
      verificationRead,
    });
  }

  return records;
}

/**
 * Disclosed fallback only: write a raw storage slot after a documented blocker.
 * Records contract, slot, old value, new value, reason, and the verification
 * read-back. Never called on the default path.
 */
export async function applyStorageOverride(
  admin: TenderlyAdmin,
  reader: ForkReader,
  args: { contract: Address; slot: Hex; value: Hex; reason: string },
): Promise<StorageOverrideRecord> {
  const oldValue = await reader.storageAt(args.contract, args.slot);
  const result = await admin.setStorageAt(args.contract, args.slot, args.value);
  const verificationRead = await reader.storageAt(args.contract, args.slot);
  if (verificationRead !== args.value) {
    throw new ForkSetupError(
      `Storage override at ${args.contract} slot ${args.slot} did not apply: read back ${verificationRead}, expected ${args.value}.`,
    );
  }
  return { kind: "storage-override", ...args, oldValue, newValue: args.value, verificationRead, result };
}

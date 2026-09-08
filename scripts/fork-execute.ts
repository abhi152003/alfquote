/**
 * Controlled-fork execution proof (WO-7): verify a Tenderly Virtual
 * Environment fork of Ethereum mainnet at the recorded block, inject funding
 * and approvals for a dedicated test address, then execute the protected
 * Universal Router v2 DualPool swap. Exits 0 only on a PASS. Mainnet is only
 * read (archive state at the fork block); nothing is ever broadcast there.
 */
import { createPublicClient, http, formatUnits } from "viem";
import type { Address, Hex } from "viem";
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  DEFAULT_SLIPPAGE_BPS,
  FIXTURE_HOOK,
  FIXTURE_POOL_ID,
  PERMIT2,
  PINNED_POOL_KEY,
  SpikeConfigError,
  UNIVERSAL_ROUTER,
  createMainnetClient,
  getIndicativeQuoteSafe,
  loadRunOptions,
  loadSpikeConfig,
  readErc20Info,
  readMaxGas,
  redactKeys,
  RunOptionsError,
} from "../src/index.js";
import { erc20Abi, permit2Abi } from "../src/abis.js";
import { decodeRevert } from "../src/simulateSwap.js";
import { ALFQUOTE_TENDERLY_FROM_ENV_VAR, TenderlyConfigError, loadTenderlyConfig, maskTenderlyUrl } from "../src/tenderly/config.js";
import { TenderlyAdminError, connectTenderlyAdmin } from "../src/tenderly/adminClient.js";
import { ForkVerificationError, assertDistinctEndpoints, verifyFork } from "../src/tenderly/forkVerify.js";
import { ForkSetupError, runForkSetup, type ForkReceipt, type ForkReader } from "../src/tenderly/forkSetup.js";
import { runForkSwap } from "../src/tenderly/forkSwap.js";
import { assertNoEndpointSecrets, buildForkEvidence } from "../src/tenderly/evidence.js";

const SLIPPAGE_ENV = "ALFQUOTE_SLIPPAGE_BPS";
const DIAGNOSTIC_ENV = "ALFQUOTE_DIAGNOSTIC";
const EVIDENCE_URL_ENV = "TENDERLY_EVIDENCE_URL";
/**
 * The committed release evidence (`fork-evidence.json`) is written only by a
 * non-diagnostic PASS run; diagnostics and failures get their own files so a
 * bad re-run can never clobber the release artifact.
 */
export function evidencePath(diagnostic: boolean, pass: boolean): string {
  const file = diagnostic
    ? "fork-evidence-diagnostic.json"
    : pass
      ? "fork-evidence.json"
      : "fork-evidence-failed.json";
  return new URL(`../docs/${file}`, import.meta.url).pathname;
}

function exitConfigError(message: string): never {
  console.error(`Configuration error: ${message}`);
  process.exit(1);
}

async function run(): Promise<void> {
  const diagnostic = process.env[DIAGNOSTIC_ENV]?.trim() === "1";
  const slippageBps = BigInt(process.env[SLIPPAGE_ENV]?.trim() || DEFAULT_SLIPPAGE_BPS.toString());

  let mainnetConfig, tenderly, options;
  try {
    mainnetConfig = loadSpikeConfig(process.env);
    tenderly = loadTenderlyConfig(process.env);
    options = loadRunOptions(process.env, process.argv.slice(2), 1n);
  } catch (error) {
    if (error instanceof SpikeConfigError || error instanceof TenderlyConfigError || error instanceof RunOptionsError) {
      exitConfigError(error.message);
    }
    throw error;
  }
  if (slippageBps !== DEFAULT_SLIPPAGE_BPS && !diagnostic) {
    exitConfigError(`Non-default slippage ${slippageBps} bps requires the diagnostic path (ALFQUOTE_DIAGNOSTIC=1).`);
  }

  console.log("ALFQuote controlled-fork execution proof (Tenderly Virtual Environment)");
  console.log(`  public endpoint: ${maskTenderlyUrl(tenderly.publicRpcUrl)}`);
  console.log(`  admin endpoint: ${maskTenderlyUrl(tenderly.adminRpcUrl)} (secret; never logged in full)`);
  console.log(`  fork block: ${tenderly.forkBlock} (chain id ${tenderly.chainId})`);
  console.log(`  test address: ${tenderly.from} (${ALFQUOTE_TENDERLY_FROM_ENV_VAR})`);
  console.log(`  amount: ${options.amountUsdc} USDC | slippage: ${slippageBps} bps`);
  if (diagnostic) console.log("  DIAGNOSTIC: this run does not determine the release result.");
  console.log();

  const mainnet = await createMainnetClient(mainnetConfig);
  assertDistinctEndpoints(tenderly, mainnetConfig.rpcUrl);

  const fork = createPublicClient({ transport: http(tenderly.publicRpcUrl) });
  const forkChainId = await fork.getChainId();
  if (forkChainId !== tenderly.chainId) {
    exitConfigError(`Fork public endpoint chain id ${forkChainId} != TENDERLY_CHAIN_ID ${tenderly.chainId}.`);
  }

  let admin;
  try {
    admin = await connectTenderlyAdmin(tenderly);
  } catch (error) {
    if (error instanceof TenderlyAdminError) exitConfigError(error.message);
    throw error;
  }

  let verification;
  try {
    verification = await verifyFork(tenderly, admin, {
      forkChainId: () => fork.getChainId(),
      forkHead: () => fork.getBlockNumber(),
      forkCode: (address) => fork.getCode({ address }),
      mainnetCode: (address, block) => mainnet.getCode({ address, blockNumber: block }),
      forkStorageAtOrigin: async (contract, slot) =>
        (await fork.getStorageAt({ address: contract, slot, blockNumber: tenderly.forkBlock })) as Hex,
      mainnetStorage: async (contract, slot, block) =>
        (await mainnet.getStorageAt({ address: contract, slot, blockNumber: block })) as Hex,
    });
  } catch (error) {
    if (error instanceof ForkVerificationError) {
      console.error(`Fork verification failed: ${error.message}`);
      process.exit(1);
    }
    throw error;
  }
  console.log("Fork verification:");
  console.log(`  chain id ${verification.chainId}; head ${verification.forkHead}; origin check: ${verification.originCheck}`);
  console.log(`  bytecode matches mainnet at block ${verification.originBlock}: ${verification.bytecodeMatches.map((c) => `${c.name}=${c.match}`).join(", ")}`);
  console.log(`  pool state slot ${verification.poolStateSlot.slice(0, 18)}… fork ${verification.poolStateWordFork.slice(0, 10)}… == mainnet ${verification.poolStateWordMainnet.slice(0, 10)}… : ${verification.poolStateMatch}`);
  console.log(`  PoolId offline derivation matches documented id: ${verification.poolIdOffline === FIXTURE_POOL_ID}`);
  console.log();

  const reader: ForkReader = {
    erc20Balance: (token, owner) =>
      fork.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [owner] }),
    nativeBalance: (address) => fork.getBalance({ address }),
    erc20Allowance: (token, owner, spender) =>
      fork.readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [owner, spender] }),
    permit2Allowance: async (owner, token, spender) => {
      const result = await fork.readContract({
        address: PERMIT2,
        abi: permit2Abi,
        functionName: "allowance",
        args: [owner, token, spender],
      });
      return { amount: BigInt(result[0]), expiration: BigInt(result[1]) };
    },
    storageAt: async (contract, slot) => (await fork.getStorageAt({ address: contract, slot })) as Hex,
    waitForReceipt: async (hash): Promise<ForkReceipt> => {
      const receipt = await fork.waitForTransactionReceipt({ hash, timeout: 90_000, confirmations: 1 });
      return {
        hash: receipt.transactionHash,
        status: receipt.status === "success" ? "success" : "reverted",
        gasUsed: receipt.gasUsed,
        blockNumber: receipt.blockNumber,
        logs: receipt.logs.map((log) => ({ address: log.address as Address, topics: log.topics as readonly Hex[], data: log.data })),
      };
    },
  };

  const headNow = await fork.getBlockNumber();
  const headBlock = await fork.getBlock({ blockNumber: headNow });
  const token0 = await readErc20Info(fork, PINNED_POOL_KEY.currency0, headNow);
  const amountInRaw = options.amountUsdc * 10n ** BigInt(token0.decimals);
  // VE blocks are stamped with real time; the wall clock lower-bounds `now` so
  // an idle gap cannot make a fresh Permit2 expiry look sufficient.
  const now = BigInt(Math.floor(Date.now() / 1000));
  const effectiveNow = headBlock.timestamp > now ? headBlock.timestamp : now;

  console.log("Setup (funding and approvals are recorded separately from the tested swap):");
  let setup;
  try {
    setup = await runForkSetup(admin, reader, { config: tenderly, amountIn: amountInRaw, now: effectiveNow });
  } catch (error) {
    if (error instanceof ForkSetupError) {
      console.error(`Setup failed: ${error.message}`);
      process.exit(1);
    }
    throw error;
  }
  for (const record of setup.funding) {
    if (record.kind === "fund-skipped") {
      console.log(`  [funding] skipped ${record.which}: ${record.reason}`);
    } else if (record.kind === "fund-native") {
      console.log(`  [funding] fund-native via ${record.method}: ${record.amountWei} wei -> ${record.address} (${record.result})`);
    } else {
      console.log(`  [funding] fund-erc20 via ${record.method}: ${record.amount} raw -> ${record.address} (${record.result})`);
    }
  }
  for (const record of setup.approvals) {
    if (record.kind === "approve-skipped") {
      console.log(`  [approval] skipped ${record.which}: ${record.reason}`);
    } else {
      console.log(`  [approval] ${record.kind} tx ${record.tx} (gas ${record.gasUsed}, block ${record.blockNumber}); read-back OK`);
    }
  }
  if (setup.overrides.length > 0) {
    console.log(`  [override] ${setup.overrides.length} storage override(s) recorded`);
  }
  console.log();

  const maxGas = await readMaxGas(fork, FIXTURE_HOOK, headNow);
  const swapQuoteBlock = await fork.getBlockNumber();
  console.log(`Swap (exact input ${options.amountUsdc} ${token0.symbol}, empty hookData, UR v2, ${slippageBps} bps):`);
  let swap;
  try {
    swap = await runForkSwap(admin, { ...reader, maxGas: () => Promise.resolve(maxGas),
      indicativeQuote: (amount) =>
        getIndicativeQuoteSafe(fork, FIXTURE_HOOK, PINNED_POOL_KEY, { zeroForOne: true, amountSpecified: -amount }, maxGas, swapQuoteBlock),
      blockTimestamp: async () => (await fork.getBlock()).timestamp,
    }, { config: tenderly, amountIn: amountInRaw, slippageBps, quoteBlock: swapQuoteBlock });
  } catch (error) {
    console.error(`Swap did not execute: ${redactKeys(error instanceof Error ? error.message : String(error))}`);
    process.exit(1);
  }

  const token1 = await readErc20Info(fork, PINNED_POOL_KEY.currency1, headNow);
  console.log(`  quote (fork block ${swap.quoteBlock}): ${formatUnits(swap.quote, token1.decimals)} ${token1.symbol}`);
  console.log(`  amountOutMinimum: ${swap.amountOutMinimum} raw (${formatUnits(swap.amountOutMinimum, token1.decimals)} ${token1.symbol})`);
  console.log(`  tx ${swap.tx} status=${swap.receipt.status} gas=${swap.receipt.gasUsed} block=${swap.receipt.blockNumber}`);
  console.log(`  actualOut (balance delta): ${swap.actualOut} raw; USDT transfers to user in logs: ${swap.transfersToUserFromLogs}`);
  console.log(`  USDC spent: ${swap.usdcSpent} raw (amountIn ${swap.amountIn})`);
  console.log(`  PoolManager Swap event observed: ${swap.poolManagerSwapObserved}; hook ModifyLiquidity events: ${swap.hookModifyLiquidityEvents}`);
  console.log(`  calldata=${swap.encoded.calldata}`);

  if (!swap.pass) {
    console.log(`  FAIL: ${swap.failure}`);
    try {
      await fork.call({ to: UNIVERSAL_ROUTER, data: swap.encoded.calldata, account: tenderly.from });
      console.log("  eth_call replay after the failed tx unexpectedly succeeded (state moved past the failure).");
    } catch (error) {
      const decoded = decodeRevert(error);
      console.log(`  decoded failure: ${decoded.name} — ${redactKeys(decoded.shortMessage)}`);
    }
  }

  const evidence = buildForkEvidence({
    config: tenderly,
    verification,
    setup,
    swap,
    poolId: FIXTURE_POOL_ID,
    ...(process.env[EVIDENCE_URL_ENV]?.trim() ? { evidenceLink: process.env[EVIDENCE_URL_ENV]?.trim() } : {}),
  });
  const serialized = JSON.stringify(evidence, (_, value) => (typeof value === "bigint" ? value.toString() : value), 2);
  assertNoEndpointSecrets(serialized, tenderly);
  const evidenceFile = evidencePath(diagnostic, swap.pass);
  await writeFile(evidenceFile, `${serialized}\n`, "utf8");
  console.log();
  console.log(`Evidence written to ${evidenceFile} (endpoints redacted; ${CONTROLLED_LABEL})`);

  if (swap.pass) {
    console.log(`PASS: protected ${options.amountUsdc} USDC swap completed with actual output >= amountOutMinimum on the controlled fork.`);
    process.exit(diagnostic ? 1 : 0);
  }
  process.exit(1);
}

const CONTROLLED_LABEL = "controlled-fork execution, not a mainnet transaction";

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  run().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\nFork execution failed: ${redactKeys(message)}`);
    process.exit(1);
  });
}

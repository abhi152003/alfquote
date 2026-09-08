/**
 * Controlled-fork execution proof. Mainnet is read-only; all mutations are
 * confined to a verified Tenderly Virtual Environment.
 */
import { createPublicClient, http, formatUnits } from "viem";
import type { Address, Hex } from "viem";
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  decodeRevert,
  DEFAULT_SLIPPAGE_BPS,
  erc20Abi, permit2Abi,
  FIXTURE_HOOK,
  FIXTURE_POOL_ID,
  getIndicativeQuoteSafe,
  PERMIT2,
  PINNED_POOL_KEY,
  readErc20Info,
  readHookStats,
  readMaxGas,
  redactRpcSecrets,
  UNIVERSAL_ROUTER,
} from "alfquote";
import {
  createMainnetClient,
} from "../lib/client.js";
import {
  loadSpikeConfig,
  SpikeConfigError,
} from "../lib/config.js";
import {
  loadRunOptions,
  RunOptionsError,
} from "../lib/runOptions.js";
import { ALFQUOTE_TENDERLY_FROM_ENV_VAR, TenderlyConfigError, loadTenderlyConfig, maskTenderlyUrl } from "./config.js";
import { TenderlyAdminError, connectTenderlyAdmin } from "./adminClient.js";
import { ForkVerificationError, assertDistinctEndpoints, verifyFork } from "./forkVerify.js";
import { ForkSetupError, runForkSetup, type ForkReceipt, type ForkReader } from "./forkSetup.js";
import { runForkSwap } from "./forkSwap.js";
import { assertNoEndpointSecrets, buildForkEvidence, validateReleaseEvidence } from "./evidence.js";

const SLIPPAGE_ENV = "ALFQUOTE_SLIPPAGE_BPS";
const DIAGNOSTIC_ENV = "ALFQUOTE_DIAGNOSTIC";
const EVIDENCE_URL_ENV = "TENDERLY_EVIDENCE_URL";
const CONTROLLED_LABEL = "controlled-fork execution, not a mainnet transaction";

export function evidencePath(diagnostic: boolean, pass: boolean): string {
  const file = diagnostic ? "fork-evidence-diagnostic.json" : pass ? "fork-evidence.json" : "fork-evidence-failed.json";
  return new URL(`../../docs/${file}`, import.meta.url).pathname;
}

function exitConfigError(message: string): never {
  console.error(`Configuration error: ${message}`);
  process.exit(1);
}

/** Configured endpoints, published as soon as they parse so even top-level crashes redact them. */
let activeTenderlyUrls: readonly string[] = [];

async function run(): Promise<void> {
  const diagnostic = process.env[DIAGNOSTIC_ENV]?.trim() === "1";
  const slippageBps = BigInt(process.env[SLIPPAGE_ENV]?.trim() || DEFAULT_SLIPPAGE_BPS.toString());
  let mainnetConfig, tenderly, options;
  try {
    mainnetConfig = loadSpikeConfig(process.env);
    tenderly = loadTenderlyConfig(process.env);
    options = loadRunOptions(process.env, process.argv.slice(2), 1n);
  } catch (error) {
    if (error instanceof SpikeConfigError || error instanceof TenderlyConfigError || error instanceof RunOptionsError) exitConfigError(error.message);
    throw error;
  }
  activeTenderlyUrls = [tenderly.publicRpcUrl, tenderly.adminRpcUrl];
  const tenderlyUrls = activeTenderlyUrls;
  const safeError = (error: unknown) => redactRpcSecrets(error instanceof Error ? error.message : String(error), tenderlyUrls);
  if (slippageBps !== DEFAULT_SLIPPAGE_BPS && !diagnostic) exitConfigError(`Non-default slippage ${slippageBps} bps requires ALFQUOTE_DIAGNOSTIC=1.`);
  if (!diagnostic) {
    // Release runs need the public evidence link up front: validation happens
    // after the swap, and a missing link would waste the one-shot fresh run.
    const link = process.env[EVIDENCE_URL_ENV]?.trim();
    if (!link) exitConfigError(`${EVIDENCE_URL_ENV} is not set. The release evidence requires a public/read-only Tenderly link (the Virtual Environment dashboard URL works).`);
    try {
      if (new URL(link).protocol !== "https:") exitConfigError(`${EVIDENCE_URL_ENV} must be an https URL.`);
    } catch {
      exitConfigError(`${EVIDENCE_URL_ENV} is not a valid URL.`);
    }
  }

  console.log("ALFQuote controlled-fork execution proof (Tenderly Virtual Environment)");
  console.log(`  public endpoint: ${maskTenderlyUrl(tenderly.publicRpcUrl)}`);
  console.log(`  admin endpoint: ${maskTenderlyUrl(tenderly.adminRpcUrl)} (secret)`);
  console.log(`  fork block: ${tenderly.forkBlock} (chain id ${tenderly.chainId})`);
  console.log(`  test address: ${tenderly.from} (${ALFQUOTE_TENDERLY_FROM_ENV_VAR})`);
  console.log(`  amount: ${options.amountUsdc} USDC | slippage: ${slippageBps} bps`);
  if (diagnostic) console.log("  DIAGNOSTIC: this run does not determine the release result.");

  const mainnet = await createMainnetClient(mainnetConfig);
  assertDistinctEndpoints(tenderly, mainnetConfig.rpcUrl);
  const fork = createPublicClient({ transport: http(tenderly.publicRpcUrl) });
  const forkChainId = await fork.getChainId();
  if (forkChainId !== tenderly.chainId) exitConfigError(`Fork chain id ${forkChainId} != configured ${tenderly.chainId}.`);

  let admin;
  try {
    admin = await connectTenderlyAdmin(tenderly);
  } catch (error) {
    if (error instanceof TenderlyAdminError) exitConfigError(safeError(error));
    throw error;
  }

  let verification;
  try {
    verification = await verifyFork(tenderly, admin, {
      forkChainId: () => fork.getChainId(),
      forkHead: () => fork.getBlockNumber(),
      forkCode: (address) => fork.getCode({ address, blockNumber: tenderly.forkBlock }),
      mainnetCode: (address, block) => mainnet.getCode({ address, blockNumber: block }),
      forkStorageAtOrigin: async (contract, slot) => (await fork.getStorageAt({ address: contract, slot, blockNumber: tenderly.forkBlock })) as Hex,
      mainnetStorage: async (contract, slot, block) => (await mainnet.getStorageAt({ address: contract, slot, blockNumber: block })) as Hex,
      forkBlockHash: async (block) => {
        const value = await fork.getBlock({ blockNumber: block });
        if (!value.hash) throw new ForkVerificationError(`Fork block ${block} has no hash.`);
        return value.hash;
      },
      mainnetBlockHash: async (block) => {
        const value = await mainnet.getBlock({ blockNumber: block });
        if (!value.hash) throw new ForkVerificationError(`Mainnet block ${block} has no hash.`);
        return value.hash;
      },
      originStats: async (side) => {
        const client = side === "fork" ? fork : mainnet;
        const stats = await readHookStats(client, FIXTURE_HOOK, PINNED_POOL_KEY, tenderly.forkBlock);
        return { reserves: stats.reserves, effectiveLiquidity: stats.effectiveLiquidity };
      },
    });
  } catch (error) {
    console.error(`Fork verification failed: ${safeError(error)}`);
    process.exit(1);
  }
  console.log(`Fork verified: block ${verification.originBlock}, hash ${verification.forkOriginBlockHash}, bytecode/state match.`);

  const reader: ForkReader = {
    erc20Balance: (token, owner) => fork.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [owner] }),
    nativeBalance: (address) => fork.getBalance({ address }),
    erc20Allowance: (token, owner, spender) => fork.readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [owner, spender] }),
    permit2Allowance: async (owner, token, spender) => {
      const result = await fork.readContract({ address: PERMIT2, abi: permit2Abi, functionName: "allowance", args: [owner, token, spender] });
      return { amount: BigInt(result[0]), expiration: BigInt(result[1]) };
    },
    storageAt: async (contract, slot) => (await fork.getStorageAt({ address: contract, slot })) as Hex,
    waitForReceipt: async (hash): Promise<ForkReceipt> => {
      const receipt = await fork.waitForTransactionReceipt({ hash, timeout: 90_000, confirmations: 1 });
      return { hash: receipt.transactionHash, status: receipt.status === "success" ? "success" : "reverted", gasUsed: receipt.gasUsed, blockNumber: receipt.blockNumber, logs: receipt.logs.map((log) => ({ address: log.address as Address, topics: log.topics as readonly Hex[], data: log.data })) };
    },
  };

  const headNow = await fork.getBlockNumber();
  const headBlock = await fork.getBlock({ blockNumber: headNow });
  const token0 = await readErc20Info(fork, PINNED_POOL_KEY.currency0, headNow);
  const amountInRaw = options.amountUsdc * 10n ** BigInt(token0.decimals);
  const wallClock = BigInt(Math.floor(Date.now() / 1000));
  const effectiveNow = headBlock.timestamp > wallClock ? headBlock.timestamp : wallClock;

  let setup;
  try {
    setup = await runForkSetup(admin, reader, { config: tenderly, amountIn: amountInRaw, now: effectiveNow });
  } catch (error) {
    console.error(`Setup failed: ${safeError(error)}`);
    process.exit(1);
  }
  const maxGas = await readMaxGas(fork, FIXTURE_HOOK, await fork.getBlockNumber());
  const swapQuoteBlock = await fork.getBlockNumber();
  let swap;
  try {
    swap = await runForkSwap(admin, { ...reader, indicativeQuote: (amount) => getIndicativeQuoteSafe(fork, FIXTURE_HOOK, PINNED_POOL_KEY, { zeroForOne: true, amountSpecified: -amount }, maxGas, swapQuoteBlock), blockTimestamp: async () => (await fork.getBlock()).timestamp }, { config: tenderly, amountIn: amountInRaw, slippageBps, quoteBlock: swapQuoteBlock });
  } catch (error) {
    console.error(`Swap did not execute: ${safeError(error)}`);
    process.exit(1);
  }

  const token1 = await readErc20Info(fork, PINNED_POOL_KEY.currency1, await fork.getBlockNumber());
  console.log(`Swap tx ${swap.tx}: quote ${formatUnits(swap.quote, token1.decimals)}, min ${formatUnits(swap.amountOutMinimum, token1.decimals)}, actual ${formatUnits(swap.actualOut, token1.decimals)}, gas ${swap.receipt.gasUsed}.`);
  if (!swap.pass) {
    try {
      await fork.call({ to: UNIVERSAL_ROUTER, data: swap.encoded.calldata, account: tenderly.from });
    } catch (error) {
      const decoded = decodeRevert(error);
      console.error(`Decoded failure: ${decoded.name} — ${safeError(decoded.shortMessage)}`);
    }
  }

  const evidenceLink = process.env[EVIDENCE_URL_ENV]?.trim();
  const evidence = buildForkEvidence({ config: tenderly, verification, setup, swap, poolId: FIXTURE_POOL_ID, ...(evidenceLink ? { evidenceLink } : {}) });
  const serialized = JSON.stringify(evidence, (_, value) => typeof value === "bigint" ? value.toString() : value, 2);
  assertNoEndpointSecrets(serialized, tenderly);
  if (!diagnostic && swap.pass) validateReleaseEvidence(evidence);
  const evidenceFile = evidencePath(diagnostic, swap.pass);
  await writeFile(evidenceFile, `${serialized}\n`, "utf8");
  console.log(`Evidence written to ${evidenceFile} (${CONTROLLED_LABEL}).`);
  if (swap.pass) {
    console.log(`PASS: protected ${options.amountUsdc} USDC swap completed.`);
    process.exit(diagnostic ? 1 : 0);
  }
  process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  run().catch((error: unknown) => {
    console.error(`Fork execution failed: ${redactRpcSecrets(error instanceof Error ? error.message : String(error), activeTenderlyUrls)}`);
    process.exit(1);
  });
}

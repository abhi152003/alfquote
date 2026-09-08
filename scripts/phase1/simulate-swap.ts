/** Dry-run Universal Router `V4_SWAP` for the pinned DualPool. Does not send. */
import { formatUnits, isAddress } from "viem";
import type { Address } from "viem";
import {
  DEFAULT_SLIPPAGE_BPS,
  maskRpcUrl,
  PERMIT2,
  POOL_MANAGER,
  quoteFillGapBps,
  redactKeys,
  UNIVERSAL_ROUTER,
} from "alfquote";
import {
  FIXTURE_POOL_ID,
  runProtectedSimulation,
} from "alfquote/phase1";
import {
  createMainnetClient,
} from "../lib/client.js";
import {
  loadSpikeConfig,
  RPC_URL_ENV_VAR,
  SpikeConfigError,
} from "../lib/config.js";
import {
  loadRunOptions,
  resolveBlockNumber,
  RunOptionsError,
} from "../lib/runOptions.js";

const SENDER_ENV = "ALFQUOTE_SIMULATION_FROM";
const SLIPPAGE_ENV = "ALFQUOTE_SLIPPAGE_BPS";
const DIAGNOSTIC_ENV = "ALFQUOTE_DIAGNOSTIC";

async function run(): Promise<void> {
  let config;
  try {
    config = loadSpikeConfig(process.env);
  } catch (error) {
    if (error instanceof SpikeConfigError) {
      console.error(`Spike configuration error: ${error.message}`);
      process.exit(1);
    }
    throw error;
  }

  let options;
  try {
    options = loadRunOptions(process.env, process.argv.slice(2));
  } catch (error) {
    if (error instanceof RunOptionsError) {
      console.error(`Spike configuration error: ${error.message}`);
      process.exit(1);
    }
    throw error;
  }

  const diagnostic = process.env[DIAGNOSTIC_ENV]?.trim() === "1";
  const slippageBps = BigInt(process.env[SLIPPAGE_ENV]?.trim() || DEFAULT_SLIPPAGE_BPS.toString());
  const senderRaw = process.env[SENDER_ENV]?.trim();
  const sender = senderRaw && isAddress(senderRaw) ? (senderRaw as Address) : null;

  console.log(diagnostic ? "ALFQuote Universal Router diagnostic dry-run" : "ALFQuote Universal Router dry-run");
  console.log(`  ${RPC_URL_ENV_VAR}: ${maskRpcUrl(config.rpcUrl)}`);
  console.log(`  slippage: ${slippageBps} bps`);
  console.log(`  amount: ${options.amountUsdc} USDC`);
  console.log(`  sender: ${sender ?? `(unset ${SENDER_ENV})`}`);
  if (diagnostic) {
    console.log("  DIAGNOSTIC: this command never determines the release result.");
  }
  console.log();

  const client = await createMainnetClient(config);
  const resolved = await resolveBlockNumber(client, options.blockNumber);
  const block = resolved.blockNumber;
  console.log(
    resolved.source === "pinned"
      ? `Pinned historical block ${block} (archive RPC required to replay).`
      : `Latest-state block ${block}.`,
  );

  if (!sender) {
    const reason = senderRaw
      ? `${SENDER_ENV} is not a valid Ethereum address: "${senderRaw}".`
      : `${SENDER_ENV} is not set. Add a mainnet address to .env (dry-run msg.sender only; nothing is signed or sent).`;
    console.log("Recorded issues:");
    console.log(`  - ${reason}`);
    process.exit(1);
  }

  if (slippageBps !== DEFAULT_SLIPPAGE_BPS) {
    console.log(
      `DIAGNOSTIC-ONLY slippage ${slippageBps} bps (Phase 1 gate uses ${DEFAULT_SLIPPAGE_BPS} bps; this is not a recommended setting).`,
    );
    if (!diagnostic) {
      console.error("Non-default slippage is not allowed on the release simulate path. Use npm run simulate:diagnostic.");
      process.exit(1);
    }
  }

  const sim = await runProtectedSimulation(client, {
    sender,
    amountUsdc: options.amountUsdc,
    slippageBps,
    blockNumber: block,
  });

  console.log(`Pool ${FIXTURE_POOL_ID}`);
  console.log(
    `  quote block ${block}: ${formatUnits(sim.quote, sim.token1.decimals)} ${sim.token1.symbol} for ${options.amountUsdc} ${sim.token0.symbol}`,
  );
  console.log(
    `  amountOutMinimum ${sim.amountOutMinimum} (${formatUnits(sim.amountOutMinimum, sim.token1.decimals)} ${sim.token1.symbol})`,
  );
  console.log(`  hookData encoding: empty`);
  console.log();
  console.log(`Phase 1 encoding ${sim.encoded.encoding}: commands=${sim.encoded.commands} actions=${sim.encoded.actions}`);
  console.log(`  PoolManager ${POOL_MANAGER}`);
  console.log(`  Universal Router ${UNIVERSAL_ROUTER}`);
  console.log(`  Permit2 ${PERMIT2}`);
  console.log();
  console.log(`Allowances at block ${block} (not modified):`);
  console.log(`  balance ${sim.allowances.balance} ${sim.token0.symbol}`);
  console.log(`  ERC-20 → Permit2 ${sim.allowances.erc20ToPermit2}`);
  console.log(
    `  Permit2 → UR amount=${sim.allowances.permit2ToRouter.amount} expiration=${sim.allowances.permit2ToRouter.expiration}`,
  );
  for (const issue of sim.allowanceIssues) {
    console.log(`  blocker: ${issue}`);
  }

  console.log();
  console.log(`Simulating v2 execute from ${sender} at ${resolved.source} block ${block}`);
  console.log(`  encoding=${sim.encoded.encoding} commands=${sim.encoded.commands} deadline=${sim.deadline}`);
  console.log(`  inputs=${sim.encoded.inputs.join(",")}`);
  console.log(`  calldata=${sim.encoded.calldata}`);

  if (sim.result.ok) {
    console.log(`  SUCCESS gas=${sim.result.gas}`);
    console.log(`Record quote/sim block ${block}, gas, and calldata in docs/pins.md.`);
    process.exit(sim.allowanceIssues.length || diagnostic ? 1 : 0);
  }

  const actual = sim.result.revert?.actualOut;
  if (actual !== undefined) {
    const gap = quoteFillGapBps(sim.quote, actual);
    console.log(
      `  fill ${actual} ${sim.token1.symbol} raw vs quote ${sim.quote} (gap ${gap} bps); minOut ${sim.amountOutMinimum}`,
    );
  }
  console.log(`  REVERT ${redactKeys(sim.result.revert?.shortMessage ?? "unknown")}`);
  console.log(`  correctable (balance/allowance/transfer): ${sim.result.revert?.correctable ?? false}`);
  console.log(`Record quote/sim block ${block}, revert, and calldata in docs/pins.md.`);
  process.exit(1);
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\nSimulate failed: ${redactKeys(message)}`);
  process.exit(1);
});

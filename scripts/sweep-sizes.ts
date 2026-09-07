/** Quote + protected sim at 1, 5, 10, and 100 USDC. Diagnostic evidence only. */
import { formatUnits, isAddress } from "viem";
import type { Address } from "viem";
import {
  RPC_URL_ENV_VAR,
  SpikeConfigError,
  loadSpikeConfig,
  loadRunOptions,
  resolveBlockNumber,
  RunOptionsError,
  createMainnetClient,
  runProtectedSimulation,
  quoteFillGapBps,
  DEFAULT_SLIPPAGE_BPS,
  SWEEP_AMOUNTS_USDC,
  maskRpcUrl,
  redactKeys,
} from "../src/index.js";

const SENDER_ENV = "ALFQUOTE_SIMULATION_FROM";

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

  const senderRaw = process.env[SENDER_ENV]?.trim();
  const sender = senderRaw && isAddress(senderRaw) ? (senderRaw as Address) : null;
  if (!sender) {
    console.error(`${SENDER_ENV} is required for the size sweep.`);
    process.exit(1);
  }

  const client = await createMainnetClient(config);
  const resolved = await resolveBlockNumber(client, options.blockNumber);
  const block = resolved.blockNumber;

  console.log("ALFQuote quote-vs-fill size sweep (empty hookData, UR v2, 50 bps)");
  console.log(`  ${RPC_URL_ENV_VAR}: ${maskRpcUrl(config.rpcUrl)}`);
  console.log(`  ${resolved.source} block ${block}${resolved.source === "pinned" ? " (archive RPC required)" : ""}`);
  console.log(`  sender ${sender}`);
  console.log();
  console.log("amount_usdc\tquote_raw\tmin_out\tactual_out\tgap_bps\trevert");

  for (const amountUsdc of SWEEP_AMOUNTS_USDC) {
    try {
      const sim = await runProtectedSimulation(client, {
        sender,
        amountUsdc,
        slippageBps: DEFAULT_SLIPPAGE_BPS,
        blockNumber: block,
      });
      const actual = sim.result.ok
        ? sim.quote
        : (sim.result.revert?.actualOut ?? null);
      const gap = actual === null ? "" : quoteFillGapBps(sim.quote, actual).toString();
      const revert = sim.result.ok
        ? "SUCCESS"
        : sim.result.revert?.name === "AllowanceExpired"
          ? "AllowanceExpired (min-out passed; settle blocked)"
          : (sim.result.revert?.name ?? "Unknown");
      console.log(
        `${amountUsdc}\t${sim.quote}\t${sim.amountOutMinimum}\t${actual ?? ""}\t${gap}\t${revert}`,
      );
      console.log(
        `  ${formatUnits(sim.quote, sim.token1.decimals)} quoted vs ${actual === null ? "n/a" : formatUnits(actual, sim.token1.decimals)} fill ${sim.token1.symbol}`,
      );
    } catch (error) {
      console.log(`${amountUsdc}\t\t\t\t\t${redactKeys(error instanceof Error ? error.message : String(error))}`);
    }
  }
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\nSweep failed: ${redactKeys(message)}`);
  process.exit(1);
});

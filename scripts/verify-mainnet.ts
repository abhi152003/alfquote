/**
 * ALFQuote mainnet verification spike (go/no-go).
 *
 * WO-1 scope: validate the spike environment only. The on-chain checks
 * (factory bytecode, deployments, IALFHook views, quoting, simulation) are
 * added by WO-2..WO-4 against the pinned addresses in docs/ALFQuote.md.
 */
import { RPC_URL_ENV_VAR, SpikeConfigError, loadSpikeConfig } from "../src/index.js";

function main(): void {
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

  console.log("ALFQuote mainnet verification spike");
  console.log(`  ${RPC_URL_ENV_VAR}: ${maskUrl(config.rpcUrl)}`);
  console.log("  Workspace scaffold verified (WO-1).");
  console.log("  On-chain checks are not implemented in this phase; they land with WO-2..WO-4.");
}

/** Hide credentials in RPC URLs before printing. */
function maskUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password) {
      parsed.username = "***";
      parsed.password = "";
    }
    if (parsed.pathname.includes("/") && /\/v2\/[^/]+/.test(parsed.pathname)) {
      parsed.pathname = parsed.pathname.replace(/\/v2\/[^/]+/, "/v2/***");
    }
    return parsed.toString();
  } catch {
    return "<unparseable>";
  }
}

main();

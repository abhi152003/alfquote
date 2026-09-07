/** Dry-run Universal Router `V4_SWAP` for the pinned DualPool. Does not send. */
import { formatUnits, isAddress } from "viem";
import type { Address } from "viem";
import {
  RPC_URL_ENV_VAR,
  SpikeConfigError,
  loadSpikeConfig,
  createMainnetClient,
  readErc20Info,
  readMaxGas,
  getIndicativeQuoteSafe,
  amountOutMinimumFromQuote,
  encodeV4ExactInSingleExecute,
  readSwapAllowances,
  allowanceBlockers,
  simulateUniversalRouterExecute,
  DEFAULT_SLIPPAGE_BPS,
  POOL_MANAGER,
  UNIVERSAL_ROUTER,
  PERMIT2,
  FIXTURE_HOOK,
  FIXTURE_POOL_ID,
  PINNED_POOL_KEY,
  maskRpcUrl,
  redactKeys,
} from "../src/index.js";

const DEMO_INPUT_UNITS = 100n;
const SENDER_ENV = "ALFQUOTE_SIMULATION_FROM";
const SLIPPAGE_ENV = "ALFQUOTE_SLIPPAGE_BPS";

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

  const slippageBps = BigInt(process.env[SLIPPAGE_ENV]?.trim() || DEFAULT_SLIPPAGE_BPS.toString());
  const senderRaw = process.env[SENDER_ENV]?.trim();
  const sender = senderRaw && isAddress(senderRaw) ? (senderRaw as Address) : null;

  console.log("ALFQuote Universal Router dry-run");
  console.log(`  ${RPC_URL_ENV_VAR}: ${maskRpcUrl(config.rpcUrl)}`);
  console.log(`  slippage: ${slippageBps} bps`);
  console.log(`  sender: ${sender ?? `(unset ${SENDER_ENV})`}`);
  console.log();

  const client = await createMainnetClient(config);
  const quoteBlock = await client.getBlockNumber();
  const key = PINNED_POOL_KEY;
  const [token0, token1] = await Promise.all([
    readErc20Info(client, key.currency0, quoteBlock),
    readErc20Info(client, key.currency1, quoteBlock),
  ]);
  const amountIn = DEMO_INPUT_UNITS * 10n ** BigInt(token0.decimals);
  const maxGas = await readMaxGas(client, FIXTURE_HOOK, quoteBlock);
  const quote = await getIndicativeQuoteSafe(
    client,
    FIXTURE_HOOK,
    key,
    { zeroForOne: true, amountSpecified: -amountIn },
    maxGas,
    quoteBlock,
  );

  if (quote.outputAmount === null || quote.outputAmount === 0n) {
    console.error(`Quote unusable at block ${quoteBlock}: ${redactKeys(quote.error ?? "zero")}`);
    process.exit(1);
  }

  const amountOutMinimum = amountOutMinimumFromQuote(quote.outputAmount, slippageBps);
  console.log(`Pool ${FIXTURE_POOL_ID}`);
  console.log(`  quote block ${quoteBlock}: ${formatUnits(quote.outputAmount, token1.decimals)} ${token1.symbol} for ${DEMO_INPUT_UNITS} ${token0.symbol}`);
  console.log(`  amountOutMinimum ${amountOutMinimum} (${formatUnits(amountOutMinimum, token1.decimals)} ${token1.symbol})`);
  console.log(`  hookData encoding: ${quote.hookDataEncoding}`);
  console.log();

  if (slippageBps !== DEFAULT_SLIPPAGE_BPS) {
    console.log(`DIAGNOSTIC-ONLY slippage ${slippageBps} bps (Phase 1 gate uses ${DEFAULT_SLIPPAGE_BPS} bps; this is not a recommended setting).`);
  }

  const encoded = encodeV4ExactInSingleExecute(
    {
      poolKey: key,
      zeroForOne: true,
      amountIn,
      amountOutMinimum,
      hookData: "0x",
    },
    "v2",
  );
  console.log(`Phase 1 encoding ${encoded.encoding}: commands=${encoded.commands} actions=${encoded.actions}`);
  console.log(`  PoolManager ${POOL_MANAGER}`);
  console.log(`  Universal Router ${UNIVERSAL_ROUTER}`);
  console.log(`  Permit2 ${PERMIT2}`);

  const blockers: string[] = [];
  if (!sender) {
    const reason = senderRaw
      ? `${SENDER_ENV} is not a valid Ethereum address: "${senderRaw}".`
      : `${SENDER_ENV} is not set. Add a mainnet address to .env (dry-run msg.sender only; nothing is signed or sent).`;
    blockers.push(reason);
    console.log(`Calldata (deadline filled at simulate time): ${encoded.calldata}`);
    console.log("Recorded issues:");
    for (const b of blockers) console.log(`  - ${b}`);
    process.exit(1);
  }

  const simBlock = await client.getBlockNumber();
  const snap = await readSwapAllowances(client, {
    token: key.currency0,
    sender,
    permit2: PERMIT2,
    router: UNIVERSAL_ROUTER,
    blockNumber: simBlock,
  });
  const now = (await client.getBlock({ blockNumber: simBlock })).timestamp;
  const allowanceIssues = allowanceBlockers(snap, amountIn, now);
  console.log();
  console.log(`Allowances at block ${simBlock} (not modified):`);
  console.log(`  balance ${snap.balance} ${token0.symbol}`);
  console.log(`  ERC-20 → Permit2 ${snap.erc20ToPermit2}`);
  console.log(`  Permit2 → UR amount=${snap.permit2ToRouter.amount} expiration=${snap.permit2ToRouter.expiration}`);
  for (const issue of allowanceIssues) {
    blockers.push(issue);
    console.log(`  blocker: ${issue}`);
  }

  const deadline = now + 600n;
  const simulated = encodeV4ExactInSingleExecute(
    { poolKey: key, zeroForOne: true, amountIn, amountOutMinimum, hookData: "0x" },
    "v2",
    deadline,
  );
  const calldata = simulated.calldata;
  console.log();
  console.log(`Simulating v2 execute from ${sender} at latest-state block ${simBlock}`);
  console.log(`  encoding=${simulated.encoding} commands=${simulated.commands} deadline=${deadline}`);
  console.log(`  inputs=${simulated.inputs.join(",")}`);
  console.log(`  calldata=${calldata}`);
  const result = await simulateUniversalRouterExecute(client, {
    sender,
    commands: simulated.commands,
    inputs: simulated.inputs,
    deadline,
    blockNumber: simBlock,
  });
  if (result.ok) {
    console.log(`  SUCCESS gas=${result.gas}`);
    console.log(`Record quote block ${quoteBlock}, simulation block ${simBlock}, gas, and calldata in docs/pins.md.`);
    process.exit(blockers.length ? 1 : 0);
  }

  console.log(`  REVERT ${redactKeys(result.revert?.shortMessage ?? "unknown")}`);
  console.log(`  correctable (balance/allowance/transfer): ${result.revert?.correctable ?? false}`);
  if (blockers.length) {
    console.log("Recorded issues:");
    for (const b of blockers) console.log(`  - ${b}`);
  }
  console.log(`Record quote block ${quoteBlock}, simulation block ${simBlock}, revert, and calldata in docs/pins.md.`);
  process.exit(1);
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\nSimulate failed: ${redactKeys(message)}`);
  process.exit(1);
});

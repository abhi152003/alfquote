/** Read-only DualPool proof: vanilla L vs reserves vs effective liquidity, then a quote. */
import { formatUnits } from "viem";
import {
  RPC_URL_ENV_VAR,
  SpikeConfigError,
  loadSpikeConfig,
  createMainnetClient,
  readVanillaLiquidity,
  readErc20Info,
  readLiveness,
  readMaxGas,
  readHookStats,
  getIndicativeQuoteSafe,
  decideProof,
  POOL_MANAGER,
  FIXTURE_HOOK,
  FIXTURE_POOL_ID,
  PINNED_POOL_KEY,
} from "../src/index.js";
import { maskRpcUrl, redactKeys } from "../src/output.js";

/** Exact-input size in whole USDC. */
const DEMO_INPUT_UNITS = 100n;

async function main(): Promise<void> {
  await run();
}

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

  console.log("ALFQuote negative-liquidity proof");
  console.log(`  ${RPC_URL_ENV_VAR}: ${maskRpcUrl(config.rpcUrl)}`);
  console.log();

  const client = await createMainnetClient(config);
  const block = await client.getBlockNumber();
  const key = PINNED_POOL_KEY;

  console.log(`Pool: ${FIXTURE_POOL_ID}`);
  console.log(`  currency0=${key.currency0} currency1=${key.currency1} fee=${key.fee} tickSpacing=${key.tickSpacing} hooks=${key.hooks}`);
  console.log(`All values below are read at block ${block} (same-block comparison).`);
  console.log();

  const blockers: string[] = [];
  const record = (ok: boolean, blocker: string) => {
    if (!ok) blockers.push(blocker);
    return ok;
  };

  const [token0, token1] = await Promise.all([
    readErc20Info(client, key.currency0, block),
    readErc20Info(client, key.currency1, block),
  ]);
  console.log(`Tokens: currency0 = ${token0.symbol} (${token0.decimals} decimals), currency1 = ${token1.symbol} (${token1.decimals} decimals)`);

  const vanilla = await readVanillaLiquidity(client, POOL_MANAGER, FIXTURE_POOL_ID, block);
  console.log();
  console.log("Capacity signals (distinct labels, same block):");
  const slot0Populated = BigInt(vanilla.slot0Word) !== 0n;
  console.log(`  [1] PoolManager vanilla liquidity: ${vanilla.liquidity} (persistent v4 liquidity units; slot0 word ${vanilla.slot0Word.slice(0, 26)}… populated=${slot0Populated})`);

  let liveness: Awaited<ReturnType<typeof readLiveness>> | null = null;
  try {
    liveness = await readLiveness(client, FIXTURE_HOOK, FIXTURE_POOL_ID, block);
    console.log(`  Liveness: hook isLive() = ${liveness.hookLive}, livePools(poolId) = ${liveness.poolLive}`);
    record(liveness.hookLive && liveness.poolLive, "pool is not live (isLive/livePools false)");
  } catch (error) {
    blockers.push(`liveness read failed: ${redactKeys(String(error))}`);
    console.log(`  Liveness: read failed: ${redactKeys(String(error))}`);
  }

  let maxGas: bigint | null = null;
  try {
    maxGas = await readMaxGas(client, FIXTURE_HOOK, block);
    console.log(`  maxGas(): ${maxGas} (bound for the quote call)`);
  } catch (error) {
    blockers.push(`maxGas read failed: ${redactKeys(String(error))}`);
    console.log(`  maxGas(): read failed: ${redactKeys(String(error))}`);
  }

  const stats = await readHookStats(client, FIXTURE_HOOK, key, block);
  const fmt = (v: readonly [bigint, bigint] | null) =>
    v === null
      ? "unavailable"
      : `${formatUnits(v[0], token0.decimals)} ${token0.symbol} / ${formatUnits(v[1], token1.decimals)} ${token1.symbol}`;
  console.log(`  [2] DualPool getReserves: ${fmt(stats.reserves)} (total economic assets; NOT executable capacity)`);
  console.log(`  [3] DualPool getEffectiveLiquidity: ${fmt(stats.effectiveLiquidity)} (currently usable assets)`);
  for (const err of stats.errors) console.log(`      stats call failed: ${redactKeys(err)}`);
  if (stats.reserves === null) blockers.push("getReserves call failed");
  if (stats.effectiveLiquidity === null) {
    blockers.push("getEffectiveLiquidity call failed");
  } else if (stats.effectiveLiquidity[0] === 0n && stats.effectiveLiquidity[1] === 0n) {
    blockers.push("effective liquidity is zero on both sides");
  }

  const amountRaw = DEMO_INPUT_UNITS * 10n ** BigInt(token0.decimals);
  const amountSpecified = -amountRaw; // exact input
  console.log();
  console.log(`Quote: exact input ${DEMO_INPUT_UNITS} ${token0.symbol} (${amountRaw} raw), zeroForOne=true, gas bound ${maxGas ?? "n/a"}`);
  let quote: Awaited<ReturnType<typeof getIndicativeQuoteSafe>> | null = null;
  const poolIsLive = Boolean(liveness?.hookLive && liveness.poolLive);
  if (maxGas !== null && poolIsLive) {
    quote = await getIndicativeQuoteSafe(
      client,
      FIXTURE_HOOK,
      key,
      { zeroForOne: true, amountSpecified },
      maxGas,
      block,
    );
    if (quote.outputAmount === null) {
      console.log(`  getIndicativeQuote failed with both hookData encodings: ${redactKeys(quote.error ?? "")}`);
      blockers.push("indicative quote call failed (both hookData encodings)");
    } else if (quote.outputAmount === 0n) {
      console.log(`  getIndicativeQuote returned 0 — skip, not success`);
      blockers.push("indicative quote is zero");
    } else {
      console.log(`  getIndicativeQuote = ${formatUnits(quote.outputAmount, token1.decimals)} ${token1.symbol} (${quote.outputAmount} raw), hookData encoding: ${quote.hookDataEncoding}`);
    }
  } else {
    console.log("  quote skipped: liveness or maxGas unavailable (fail-closed)");
  }

  const effectivePositive =
    stats.effectiveLiquidity !== null &&
    (stats.effectiveLiquidity[0] > 0n || stats.effectiveLiquidity[1] > 0n);
  const quotePositive = quote !== null && quote.outputAmount !== null && quote.outputAmount > 0n;
  const nearZeroVanilla = vanilla.liquidity <= 10n;
  const quoteAttempted = maxGas !== null && poolIsLive;
  const quoteCallFailed =
    quoteAttempted && (quote === null || quote.outputAmount === null);

  const decision = decideProof({
    livenessReadOk: liveness !== null,
    hookLive: liveness?.hookLive ?? false,
    poolLive: liveness?.poolLive ?? false,
    maxGasReadOk: maxGas !== null,
    reservesReadOk: stats.reserves !== null,
    effectiveLiquidity: stats.effectiveLiquidity,
    quoteCallFailed,
    quoteOutput: quote?.outputAmount ?? null,
  });

  console.log();
  console.log(`Vanilla liquidity: ${vanilla.liquidity} (near zero: ${nearZeroVanilla}) | effective liquidity positive: ${effectivePositive} | quote positive: ${quotePositive}`);
  console.log(`Decision: ${decision}`);
  if (blockers.length) {
    console.log("Recorded issues:");
    for (const b of blockers) console.log(`  - ${b}`);
  }
  console.log(`Record values, units, block ${block}, and call parameters in docs/pins.md.`);
  process.exit(decision === "PROCEED" ? 0 : 1);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\nProof failed: ${redactKeys(message)}`);
  process.exit(1);
});

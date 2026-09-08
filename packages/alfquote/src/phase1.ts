/**
 * Phase 1 fixture and diagnostic surface (`alfquote/phase1`).
 *
 * The main `alfquote` entry stays reusable and pool-agnostic; everything that
 * is pinned to the Phase 1 demo pool (USDC/USDT on the fixture hook) or is
 * diagnostic-only lives here instead. The generic quote service (WO-12) and
 * the generic swap planning/simulation service (WO-13) replace the fixture
 * adapter below; keep new product behavior out of this module.
 */

import type { Address, Hex, PublicClient } from "viem";
import type { PoolKey, PoolId } from "./pool.js";
import { getIndicativeQuoteSafe, readMaxGas } from "./alfQuote.js";
import { readSwapAllowances, allowanceBlockers, type AllowanceSnapshot } from "./allowances.js";
import { PERMIT2, UNIVERSAL_ROUTER, USDC, USDT } from "./addresses.js";
import { readErc20Info, type Erc20Info } from "./erc20.js";
import { simulateUniversalRouterExecute, type SimulateSwapResult } from "./simulateSwap.js";
import {
  DEFAULT_SLIPPAGE_BPS,
  amountOutMinimumFromQuote,
  encodeV4ExactInSingleExecute,
  type EncodedExecute,
} from "./v4Swap.js";

// --- Fixture identity (verified mainnet facts, pinned 2026-09-07; evidence in docs/pins.md) ---

/** Pre-factory example hook; always labeled `fixture`, never factory-attested. */
export const FIXTURE_HOOK: Address = "0x00000078BD49D5279a99b5F4011a5C61eE8caaC0";

/** Documented demo pool id for the fixture hook (USDC/USDT). */
export const FIXTURE_POOL_ID: PoolId = "0xf32349cbc41fec9d3194f2b4e9ee72ded0bfda412427be9cb8a4087f74bdb065";

/** Exact demo pool identity, decoded from the on-chain Initialize event. */
export const PINNED_POOL_KEY: PoolKey = {
  currency0: USDC,
  currency1: USDT,
  fee: 10,
  tickSpacing: 10,
  hooks: FIXTURE_HOOK,
};

export const DEMO_POOL_INIT = {
  block: 25_540_385n,
  tx: "0x6e4d659056af64eb5c5f3f045e1536cbb9f9955169f33369b13be8c724729d03" as Hex,
};

export const POOL_MANAGER_BIRTH_BLOCK = 21_688_329n;
export const FACTORY_BIRTH_BLOCK = 25_581_749n;
export const FIXTURE_HOOK_BIRTH_BLOCK = 25_525_327n;

/** The registry is append-only, so every pinned entry must remain present. */
export const FACTORY_REGISTRY_SNAPSHOT: Address[] = [
  "0x0000005bb4DF4109bF356a585C8b8Ea70FCbAaC0",
  "0x55BA643a0716988F2a7E7ff27Dc4c80BEa8a6ac0",
  "0x7b919ca67cbd31Ce752761e88Eb674acBFd22ac0",
  "0xCDE44B16E25B4321EF6471A4aa8D9D4D4Fbf2AC0",
  "0x000075e7511D6104d8b1e617A27d426d7611eac0",
];

// --- Diagnostic-only quote encoding (not a Phase 2 pass path) ------------------------------

export { getIndicativeQuoteEncodedDiagnostic } from "./alfQuote.js";

// --- Fixture-locked protected simulation -----------------------------------------------------

export interface ProtectedSimRun {
  amountIn: bigint;
  quote: bigint;
  amountOutMinimum: bigint;
  token0: Erc20Info;
  token1: Erc20Info;
  encoded: EncodedExecute;
  deadline: bigint;
  allowances: AllowanceSnapshot;
  allowanceIssues: string[];
  result: SimulateSwapResult;
}

/** Quote, encode, and read-only-simulate the protected fixture swap at `blockNumber`. */
export async function runProtectedSimulation(
  client: PublicClient,
  args: {
    sender: Address;
    amountUsdc: bigint;
    slippageBps?: bigint;
    blockNumber: bigint;
  },
): Promise<ProtectedSimRun> {
  const slippageBps = args.slippageBps ?? DEFAULT_SLIPPAGE_BPS;
  const key = PINNED_POOL_KEY;
  const [token0, token1] = await Promise.all([
    readErc20Info(client, key.currency0, args.blockNumber),
    readErc20Info(client, key.currency1, args.blockNumber),
  ]);
  const amountIn = args.amountUsdc * 10n ** BigInt(token0.decimals);
  const maxGas = await readMaxGas(client, FIXTURE_HOOK, args.blockNumber);
  const quote = await getIndicativeQuoteSafe(
    client,
    FIXTURE_HOOK,
    key,
    { zeroForOne: true, amountSpecified: -amountIn },
    maxGas,
    args.blockNumber,
  );
  if (quote.outputAmount === null || quote.outputAmount === 0n) {
    throw new Error(`Quote unusable at block ${args.blockNumber}: ${quote.error ?? "zero"}`);
  }
  if (quote.hookDataEncoding !== "empty") {
    throw new Error(`Quote did not use empty DualPool hookData (${quote.hookDataEncoding})`);
  }
  const amountOutMinimum = amountOutMinimumFromQuote(quote.outputAmount, slippageBps);
  const allowances = await readSwapAllowances(client, {
    token: key.currency0,
    sender: args.sender,
    permit2: PERMIT2,
    router: UNIVERSAL_ROUTER,
    blockNumber: args.blockNumber,
  });
  const now = (await client.getBlock({ blockNumber: args.blockNumber })).timestamp;
  const deadline = now + 600n;
  const encoded = encodeV4ExactInSingleExecute(
    {
      poolKey: key,
      zeroForOne: true,
      amountIn,
      amountOutMinimum,
      hookData: "0x",
    },
    "v2",
    deadline,
  );
  const result = await simulateUniversalRouterExecute(client, {
    sender: args.sender,
    commands: encoded.commands,
    inputs: encoded.inputs,
    deadline,
    blockNumber: args.blockNumber,
  });
  return {
    amountIn,
    quote: quote.outputAmount,
    amountOutMinimum,
    token0,
    token1,
    encoded,
    deadline,
    allowances,
    allowanceIssues: allowanceBlockers(allowances, amountIn, now),
    result,
  };
}

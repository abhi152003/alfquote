/** Command adapters: translate parsed options into library service calls. No protocol logic. */

import { createPublicClient, http, parseUnits } from "viem";
import type { Address, PublicClient } from "viem";
import {
  assessHook,
  derivePoolId,
  discoverFactoryHooks,
  discoverHookPools,
  planProtectedSwap,
  quoteExactIn,
  simulateProtectedSwap,
  type CommandResult,
  type PoolKey,
} from "alfquote";
import { FIXTURE_HOOK, FIXTURE_POOL_ID, PINNED_POOL_KEY } from "alfquote/phase1";
import { ArgsError } from "./args.js";
import type { AssessOptions, DiscoverOptions, PoolContext, QuoteOptions, SwapOptions } from "./args.js";

export function createClient(rpcUrl: string): PublicClient {
  return createPublicClient({ transport: http(rpcUrl) });
}

/** Resolve the pool context to the concrete hook, PoolKey, and PoolId. */
function resolvePool(pool: PoolContext): { hook: Address; key: PoolKey; poolId: `0x${string}` } {
  if (pool.useFixturePool) {
    return { hook: FIXTURE_HOOK, key: PINNED_POOL_KEY, poolId: FIXTURE_POOL_ID };
  }
  const key: PoolKey = {
    currency0: pool.currency0!,
    currency1: pool.currency1!,
    fee: pool.fee!,
    tickSpacing: pool.tickSpacing!,
    hooks: pool.hook!,
  };
  return { hook: pool.hook!, key, poolId: derivePoolId(key) };
}

export async function runDiscover(
  client: PublicClient,
  options: DiscoverOptions,
): Promise<CommandResult<unknown, object>> {
  if (options.poolsFor !== undefined && options.fromBlock !== undefined) {
    return discoverHookPools(client, {
      hook: options.poolsFor,
      fromBlock: options.fromBlock,
      ...(options.toBlock !== undefined ? { toBlock: options.toBlock } : {}),
    });
  }
  return discoverFactoryHooks(client, {
    ...(options.fixtures.length > 0 ? { fixtures: options.fixtures } : {}),
    ...(options.block !== undefined ? { blockNumber: options.block } : {}),
  });
}

export async function runAssess(
  client: PublicClient,
  options: AssessOptions,
): Promise<CommandResult<unknown, object>> {
  if (options.useFixturePool) {
    assertPoolIdMatches(options.pool, { key: PINNED_POOL_KEY, poolId: FIXTURE_POOL_ID });
  }
  return assessHook(client, {
    hook: options.hook,
    ...(options.pool !== undefined || options.useFixturePool
      ? { poolId: options.useFixturePool ? FIXTURE_POOL_ID : options.pool }
      : {}),
    ...(options.useFixturePool ? { poolKey: PINNED_POOL_KEY } : {}),
    fixture: options.fixture,
    ...(options.block !== undefined ? { blockNumber: options.block } : {}),
  });
}

export async function runQuote(
  client: PublicClient,
  options: QuoteOptions,
): Promise<CommandResult<unknown, object>> {
  const context = resolvePool(options.pool);
  assertPoolIdMatches(options.poolId, context);
  const amountRaw = parseUnits(options.amount, options.decimals);
  return quoteExactIn(client, {
    hook: context.hook,
    poolKey: context.key,
    poolId: options.poolId ?? context.poolId,
    zeroForOne: options.zeroForOne,
    amountInRaw: amountRaw,
    ...(options.block !== undefined ? { blockNumber: options.block } : {}),
  });
}

/** Reject a supplied PoolId that does not match the resolved PoolKey, before any RPC reads. */
function assertPoolIdMatches(supplied: `0x${string}` | undefined, context: { key: PoolKey; poolId: `0x${string}` }): void {
  if (supplied !== undefined && supplied.toLowerCase() !== context.poolId.toLowerCase()) {
    throw new ArgsError(
      `--pool ${supplied} does not match the PoolId derived from the supplied PoolKey (${context.poolId}); refusing to mix identities`,
    );
  }
}

export async function runSwap(
  client: PublicClient,
  options: SwapOptions,
): Promise<CommandResult<unknown, object>> {
  const context = resolvePool(options.pool);
  const amountRaw = parseUnits(options.amount, options.decimals);
  const quote = await quoteExactIn(client, {
    hook: context.hook,
    poolKey: context.key,
    poolId: context.poolId,
    zeroForOne: true,
    amountInRaw: amountRaw,
    ...(options.block !== undefined ? { blockNumber: options.block } : {}),
  });
  if (quote.status !== "ok") return quote;

  const planned = planProtectedSwap({
    poolKey: context.key,
    zeroForOne: true,
    amountInRaw: amountRaw,
    quotedOutputRaw: quote.data.outputAmountRaw,
    slippageBps: BigInt(options.slippageBps),
    deadline: BigInt(Math.floor(Date.now() / 1000) + 600),
  });
  if (planned.status !== "ok") return planned;

  return simulateProtectedSwap(client, {
    sender: options.sender,
    plan: planned.data,
    ...(options.block !== undefined ? { blockNumber: options.block } : {}),
  });
}

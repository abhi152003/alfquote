export const AMOUNT_ENV_VAR = "ALFQUOTE_AMOUNT_USDC";
export const BLOCK_ENV_VAR = "ALFQUOTE_BLOCK";
export const DEFAULT_AMOUNT_USDC = 100n;
export const SWEEP_AMOUNTS_USDC = [1n, 5n, 10n, 100n] as const;

export class RunOptionsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RunOptionsError";
  }
}

export interface RunOptions {
  amountUsdc: bigint;
  blockNumber: bigint | undefined;
}

function flagValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index === -1) return undefined;
  return argv[index + 1];
}

function parsePositiveInt(raw: string, label: string): bigint {
  if (!/^[1-9][0-9]*$/.test(raw)) {
    throw new RunOptionsError(`${label} must be a positive integer, got "${raw}"`);
  }
  return BigInt(raw);
}

/** Whole USDC units and optional block. `--amount` / `--block` override env. */
export function loadRunOptions(
  env: Record<string, string | undefined>,
  argv: readonly string[] = [],
  defaultAmountUsdc: bigint = DEFAULT_AMOUNT_USDC,
): RunOptions {
  const amountRaw = flagValue(argv, "--amount") ?? env[AMOUNT_ENV_VAR]?.trim();
  const blockRaw = flagValue(argv, "--block") ?? env[BLOCK_ENV_VAR]?.trim();
  const amountUsdc =
    amountRaw === undefined || amountRaw === ""
      ? defaultAmountUsdc
      : parsePositiveInt(amountRaw, "amount");
  const blockNumber =
    blockRaw === undefined || blockRaw === "" ? undefined : parsePositiveInt(blockRaw, "block");
  return { amountUsdc, blockNumber };
}

export async function resolveBlockNumber(
  client: { getBlockNumber: () => Promise<bigint> },
  pinned: bigint | undefined,
): Promise<{ blockNumber: bigint; source: "pinned" | "latest" }> {
  if (pinned !== undefined) return { blockNumber: pinned, source: "pinned" };
  return { blockNumber: await client.getBlockNumber(), source: "latest" };
}

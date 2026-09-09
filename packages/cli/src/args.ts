/** Argument parsing built on commander: fail-closed validators, typed assembly, no env access. */

import { Command, CommanderError, InvalidArgumentError } from "commander";
import type { OptionValues } from "commander";
import { isAddress } from "viem";
import type { Address } from "viem";

export type Format = "human" | "json";
export type CommandName = "discover" | "assess" | "quote" | "swap";

export const COMMANDS: readonly CommandName[] = ["discover", "assess", "quote", "swap"];

export const CLI_VERSION = "0.1.0";

export interface CommonOptions {
  readonly format: Format;
  readonly block?: bigint;
  readonly chain: number;
  readonly rpc?: string;
}

export interface DiscoverOptions extends CommonOptions {
  readonly command: "discover";
  readonly fixtures: readonly Address[];
  readonly poolsFor?: Address;
  readonly fromBlock?: bigint;
  readonly toBlock?: bigint;
}

export interface AssessOptions extends CommonOptions {
  readonly command: "assess";
  readonly hook: Address;
  readonly pool?: `0x${string}`;
  readonly fixture: boolean;
  readonly useFixturePool: boolean;
}

export interface PoolContext {
  readonly hook?: Address;
  readonly currency0?: Address;
  readonly currency1?: Address;
  readonly fee?: number;
  readonly tickSpacing?: number;
  readonly useFixturePool: boolean;
}

export interface QuoteOptions extends CommonOptions {
  readonly command: "quote";
  readonly pool: PoolContext;
  readonly poolId?: `0x${string}`;
  readonly amount: string;
  readonly decimals: number;
  readonly exactIn: boolean;
  /** Default direction is currency0 -> currency1; --one-for-zero reverses it. */
  readonly zeroForOne: boolean;
}

export interface SwapOptions extends CommonOptions {
  readonly command: "swap";
  readonly pool: PoolContext;
  readonly amount: string;
  readonly decimals: number;
  readonly slippageBps: number;
  readonly sender: Address;
  readonly dryRun: boolean;
}

export type Parsed =
  | { readonly command: "help"; readonly topic: "root" | CommandName }
  | { readonly command: "version" }
  | DiscoverOptions
  | AssessOptions
  | QuoteOptions
  | SwapOptions;

export class ArgsError extends Error {}

export interface ParseSinks {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
}

// --- fail-closed value validators (surface as commander option errors) --------------------

const addressArg =
  (label: string) =>
  (raw: string): Address => {
    if (!isAddress(raw)) throw new InvalidArgumentError(`${label} must be a valid address`);
    return raw;
  };

const poolIdArg = (raw: string): `0x${string}` => {
  if (!/^0x[0-9a-fA-F]{64}$/.test(raw)) {
    throw new InvalidArgumentError("--pool must be a 32-byte hex PoolId");
  }
  return raw.toLowerCase() as `0x${string}`;
};

const blockArg = (label: string) => (raw: string): bigint => {
  if (!/^\d+$/.test(raw)) throw new InvalidArgumentError(`${label} must be a non-negative integer`);
  return BigInt(raw);
};

const numberArg =
  (label: string) =>
  (raw: string): number => {
    if (!/^\d+$/.test(raw)) throw new InvalidArgumentError(`${label} must be a non-negative integer`);
    return Number(raw);
  };

const amountArg = (raw: string): string => {
  if (!/^\d+(\.\d+)?$/.test(raw) || Number(raw) === 0) {
    throw new InvalidArgumentError("--amount must be a positive decimal number");
  }
  return raw;
};

const formatArg = (raw: string): Format => {
  if (raw !== "human" && raw !== "json") {
    throw new InvalidArgumentError('--format must be "human" or "json"');
  }
  return raw;
};

// --- program construction -------------------------------------------------------------------

export const EXIT_CODE_NOTE =
  "Exit codes: 0 ok · 1 internal · 2 skip · 3 invalid input · 4 unavailable evidence · 5 swap blockers · 6 configuration error";

export function buildProgram(): Command {
  const program = new Command();
  program
    .name("alfquote")
    .version(CLI_VERSION)
    .description("Hook-aware DualPool discovery, assessment, quoting, and dry-run swaps")
    .exitOverride()
    .option("--format <mode>", "output mode: human or json (JSON is the versioned result envelope)", formatArg, "human")
    .option("--block <n>", "pin reads to a block (archive RPC required)", blockArg("--block"))
    .option("--chain <n>", "chain id; must be 1 in Phase 2", numberArg("--chain"), 1)
    .option("--rpc <url>", "RPC endpoint (default: ETHEREUM_RPC_URL)");
  program.addHelpText(
    "after",
    `
Examples:
  alfquote discover --chain 1 --format json
  alfquote assess --hook 0x00000078BD49D5279a99b5F4011a5C61eE8caaC0 --use-fixture-pool
  alfquote quote --use-fixture-pool --amount 1 --exact-in
  alfquote swap --use-fixture-pool --amount 1 --slippage-bps 50 --sender 0x5bc6f16Ca189D3C8d3Fbaf367611fB04a0B7b309 --dry-run

${EXIT_CODE_NOTE}`,
  );

  program
    .command("discover")
    .description("list factory deployments (and explicit fixtures), or scan a hook's pools")
    .option(
      "--fixture <address>",
      "append an explicit fixture (provenance=fixture); repeatable",
      (value: string, previous: Address[]) => [...previous, addressArg("--fixture")(value)],
      [] as Address[],
    )
    .option("--pools-for <hook>", "scan PoolManager Initialize logs for this hook's pools", addressArg("--pools-for"))
    .option("--from-block <n>", "scan range start; required with --pools-for", blockArg("--from-block"))
    .option("--to-block <n>", "scan range end (default: latest)", blockArg("--to-block"))
    .addHelpText(
      "after",
      `
Examples:
  alfquote discover --chain 1 --format json
  alfquote discover --pools-for 0x00000078BD49D5279a99b5F4011a5C61eE8caaC0 --from-block 25540380 --to-block 25540390`,
    );

  program
    .command("assess")
    .description("report compatibility, provenance, routing, and upgradeability separately")
    .requiredOption("--hook <address>", "hook to assess", addressArg("--hook"))
    .option("--pool <id>", "poolId context (enables the livePools surface check)", poolIdArg)
    .option("--fixture", "label provenance as an explicit fixture (no factory claim)")
    .option("--use-fixture-pool", "use the pinned demo pool as pool context")
    .addHelpText(
      "after",
      `
Example:
  alfquote assess --hook 0x00000078BD49D5279a99b5F4011a5C61eE8caaC0 --use-fixture-pool --fixture`,
    );

  program
    .command("quote")
    .description("exact-input indicative quote through the hook (non-binding)")
    .option("--use-fixture-pool", "quote the pinned USDC/USDT demo pool")
    .option("--hook <address>", "explicit pool context hook", addressArg("--hook"))
    .option("--currency0 <address>", "explicit pool context currency0", addressArg("--currency0"))
    .option("--currency1 <address>", "explicit pool context currency1", addressArg("--currency1"))
    .option("--fee <n>", "explicit pool context fee", numberArg("--fee"))
    .option("--tick-spacing <n>", "explicit pool context tick spacing", numberArg("--tick-spacing"))
    .option("--pool <id>", "expected PoolId (validated against the derived id)", poolIdArg)
    .requiredOption("--amount <n>", "amount in whole tokens", amountArg)
    .option("--decimals <n>", "token decimals for --amount (default: 6)", numberArg("--decimals"), 6)
    .requiredOption("--exact-in", "exact input (Phase 2 supports exact-input only)")
    .option("--zero-for-one", "swap currency0 -> currency1 (the default direction)")
    .option("--one-for-zero", "swap currency1 -> currency0")
    .addHelpText(
      "after",
      `
Example:
  alfquote quote --use-fixture-pool --amount 1 --exact-in --format json`,
    );

  program
    .command("swap")
    .description("dry-run a protected Universal Router swap (never sends)")
    .option("--use-fixture-pool", "plan and simulate the pinned demo pool")
    .option("--hook <address>", "explicit pool context hook", addressArg("--hook"))
    .option("--currency0 <address>", "explicit pool context currency0", addressArg("--currency0"))
    .option("--currency1 <address>", "explicit pool context currency1", addressArg("--currency1"))
    .option("--fee <n>", "explicit pool context fee", numberArg("--fee"))
    .option("--tick-spacing <n>", "explicit pool context tick spacing", numberArg("--tick-spacing"))
    .requiredOption("--amount <n>", "amount in whole tokens", amountArg)
    .option("--decimals <n>", "token decimals for --amount (default: 6)", numberArg("--decimals"), 6)
    .option(
      "--slippage-bps <n>",
      "slippage bound derived from the quote (default: 50)",
      (raw: string) => {
        const value = numberArg("--slippage-bps")(raw);
        if (value >= 10_000) throw new InvalidArgumentError("--slippage-bps must be below 10000");
        return value;
      },
      50,
    )
    .requiredOption("--sender <address>", "address whose balances/allowances the dry-run inspects", addressArg("--sender"))
    .option("--dry-run", "default and only mode; --send/--live/--broadcast are rejected")
    .addHelpText(
      "after",
      `
Example:
  alfquote swap --use-fixture-pool --amount 1 --slippage-bps 50 --sender 0x5bc6f16Ca189D3C8d3Fbaf367611fB04a0B7b309 --dry-run`,
    );

  return program;
}

// --- typed assembly ---------------------------------------------------------------------------

function commonFrom(values: OptionValues): CommonOptions {
  return {
    format: (values["format"] ?? "human") as Format,
    chain: (values["chain"] ?? 1) as number,
    ...(values["block"] !== undefined ? { block: values["block"] as bigint } : {}),
    ...(values["rpc"] !== undefined ? { rpc: values["rpc"] as string } : {}),
  };
}

function poolContextFrom(values: OptionValues, command: string): PoolContext {
  const pool: PoolContext = {
    ...(values["hook"] !== undefined ? { hook: values["hook"] as Address } : {}),
    ...(values["currency0"] !== undefined ? { currency0: values["currency0"] as Address } : {}),
    ...(values["currency1"] !== undefined ? { currency1: values["currency1"] as Address } : {}),
    ...(values["fee"] !== undefined ? { fee: values["fee"] as number } : {}),
    ...(values["tickSpacing"] !== undefined ? { tickSpacing: values["tickSpacing"] as number } : {}),
    useFixturePool: values["useFixturePool"] === true,
  };
  if (pool.useFixturePool && pool.hook !== undefined) {
    throw new ArgsError("pass either --use-fixture-pool or explicit pool components, not both");
  }
  if (!pool.useFixturePool && pool.hook === undefined) {
    throw new ArgsError(
      `${command} needs pool context: --use-fixture-pool or --hook with --currency0/--currency1/--fee/--tick-spacing`,
    );
  }
  if (!pool.useFixturePool) {
    for (const required of ["currency0", "currency1", "fee", "tickSpacing"] as const) {
      if (values[required] === undefined) {
        throw new ArgsError(`explicit pool context requires --${required}`);
      }
    }
  }
  return pool;
}

/**
 * Parse `argv` (excluding node/script) into a typed {@link Parsed}. Help and
 * version output is written through `sinks` and reported as the corresponding
 * Parsed variant; every invalid input throws {@link ArgsError}.
 */
export function parseArgs(argv: readonly string[], sinks: ParseSinks = { stdout: () => {}, stderr: () => {} }): Parsed {
  const program = buildProgram();
  const output = {
    writeOut: sinks.stdout,
    writeErr: sinks.stderr,
    // runCli formats invalid-input errors; suppress commander's duplicate line
    outputError: (_message: string, _write: (text: string) => void) => {},
  };
  // commander does not propagate output configuration to subcommands
  program.configureOutput(output);
  for (const command of program.commands) command.configureOutput(output);

  let selected: Parsed | undefined;
  const emit = (options: Parsed): void => {
    if (selected !== undefined) throw new ArgsError("multiple commands matched");
    selected = options;
  };

  program.commands
    .find((command) => command.name() === "discover")!
    .action((values: OptionValues, context: { args: string[] }) => {
      if (values["poolsFor"] !== undefined && values["fromBlock"] === undefined) {
        throw new ArgsError("--pools-for requires --from-block <n> (pool scans need an explicit range)");
      }
      if (values["poolsFor"] === undefined && (values["fromBlock"] !== undefined || values["toBlock"] !== undefined)) {
        throw new ArgsError("--from-block/--to-block require --pools-for <hook>");
      }
      if (values["poolsFor"] !== undefined) {
        if (Array.isArray(values["fixture"]) && values["fixture"].length > 0) {
          throw new ArgsError("--fixture is ignored by pool scans; drop it or run without --pools-for");
        }
        if (program.opts()["block"] !== undefined) {
          throw new ArgsError("--block is not used by pool scans; use --from-block/--to-block for the range");
        }
      }
      emit({
        command: "discover",
        ...commonFrom(program.opts()),
        fixtures: (values["fixture"] ?? []) as Address[],
        ...(values["poolsFor"] !== undefined ? { poolsFor: values["poolsFor"] as Address } : {}),
        ...(values["fromBlock"] !== undefined ? { fromBlock: values["fromBlock"] as bigint } : {}),
        ...(values["toBlock"] !== undefined ? { toBlock: values["toBlock"] as bigint } : {}),
      });
    });

  program.commands
    .find((command) => command.name() === "assess")!
    .action((values: OptionValues) => {
      emit({
        command: "assess",
        ...commonFrom(program.opts()),
        hook: values["hook"] as Address,
        ...(values["pool"] !== undefined ? { pool: values["pool"] as `0x${string}` } : {}),
        fixture: values["fixture"] === true,
        useFixturePool: values["useFixturePool"] === true,
      });
    });

  program.commands
    .find((command) => command.name() === "quote")!
    .action((values: OptionValues) => {
      if (values["zeroForOne"] === true && values["oneForZero"] === true) {
        throw new ArgsError("pass either --zero-for-one or --one-for-zero, not both");
      }
      emit({
        command: "quote",
        ...commonFrom(program.opts()),
        pool: poolContextFrom(values, "quote"),
        ...(values["pool"] !== undefined ? { poolId: values["pool"] as `0x${string}` } : {}),
        amount: values["amount"] as string,
        decimals: (values["decimals"] ?? 6) as number,
        exactIn: true,
        zeroForOne: values["oneForZero"] !== true,
      });
    });

  program.commands
    .find((command) => command.name() === "swap")!
    .action((values: OptionValues) => {
      emit({
        command: "swap",
        ...commonFrom(program.opts()),
        pool: poolContextFrom(values, "swap"),
        amount: values["amount"] as string,
        decimals: (values["decimals"] ?? 6) as number,
        slippageBps: (values["slippageBps"] ?? 50) as number,
        sender: values["sender"] as Address,
        dryRun: true,
      });
    });

  if (argv.length === 0) {
    sinks.stdout(program.helpInformation());
    return { command: "help", topic: "root" };
  }

  try {
    program.parse([...argv], { from: "user" });
  } catch (error) {
    if (error instanceof CommanderError) {
      const isHelp = error.code === "commander.help" || error.code === "commander.helpDisplayed" || error.message === "(outputHelp)";
      const isVersion = error.code === "commander.version" || error.message === "(version)";
      if (isVersion) return { command: "version" };
      if (isHelp) {
        const topic = COMMANDS.find((name) => argv.includes(name));
        return { command: "help", topic: topic ?? "root" };
      }
      throw new ArgsError(error.message.replace(/^error:\s*/i, ""));
    }
    throw error;
  }

  if (selected === undefined) {
    throw new ArgsError("a command is required: discover, assess, quote, or swap");
  }
  return selected;
}

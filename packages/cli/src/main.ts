#!/usr/bin/env node
/**
 * `alfquote` CLI entry point. Owns routing, rendering, and exit codes; every
 * behavior delegates to the `alfquote` library. Dry-run only.
 */
import { pathToFileURL } from "node:url";
import { errorMessage } from "alfquote";
import type { CommandResult } from "alfquote";
import { ArgsError, parseArgs } from "./args.js";
import { CliConfigError, loadCliConfig } from "./config.js";
import { runAssess, runDiscover, runQuote, runSwap, createClient } from "./commands.js";
import { renderHuman, renderJson } from "./render.js";
import {
  EXIT_BLOCKED,
  EXIT_CONFIG,
  EXIT_INTERNAL,
  EXIT_INVALID_INPUT,
  EXIT_OK,
  EXIT_SKIP,
  EXIT_UNAVAILABLE_EVIDENCE,
} from "./exit.js";

export interface OutputSinks {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
}

/** Map a command result to its documented exit code (exported for tests). */
export function exitCodeFor(result: CommandResult<unknown, object>): number {
  if (result.status === "ok") {
    if (result.command === "swap") {
      const issues = (result.data as { allowanceIssues?: readonly unknown[] }).allowanceIssues;
      if (issues !== undefined && issues.length > 0) return EXIT_BLOCKED;
    }
    return EXIT_OK;
  }
  if (result.status === "skip") return EXIT_SKIP;
  return EXIT_UNAVAILABLE_EVIDENCE;
}

/** Run the CLI against injected argv/env/sinks; returns the documented exit code. */
export async function runCli(
  argv: readonly string[],
  env: Record<string, string | undefined>,
  sinks: OutputSinks = { stdout: (t) => console.log(t), stderr: (t) => console.error(t) },
): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs(argv, sinks);
  } catch (error) {
    if (error instanceof ArgsError) {
      sinks.stderr(`invalid input: ${error.message}`);
      sinks.stderr(`Run alfquote --help for usage.`);
      return EXIT_INVALID_INPUT;
    }
    throw error;
  }

  if (parsed.command === "version") return EXIT_OK;
  if (parsed.command === "help") return EXIT_OK;

  let rpcUrl: string;
  try {
    rpcUrl = loadCliConfig(env, { rpc: parsed.rpc, chain: parsed.chain }).rpcUrl;
  } catch (error) {
    if (error instanceof CliConfigError) {
      sinks.stderr(`configuration error: ${error.message}`);
      return EXIT_CONFIG;
    }
    throw error;
  }

  const client = createClient(rpcUrl);
  let result: CommandResult<unknown, object>;
  switch (parsed.command) {
    case "discover":
      result = await runDiscover(client, parsed);
      break;
    case "assess":
      result = await runAssess(client, parsed);
      break;
    case "quote":
      result = await runQuote(client, parsed);
      break;
    case "swap":
      result = await runSwap(client, parsed);
      break;
  }

  sinks.stdout(parsed.format === "json" ? renderJson(result) : renderHuman(result));
  return exitCodeFor(result);
}

async function main(): Promise<number> {
  try {
    return await runCli(process.argv.slice(2), process.env);
  } catch (error) {
    console.error(`internal error: ${errorMessage(error)}`);
    return EXIT_INTERNAL;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().then((code) => process.exit(code));
}

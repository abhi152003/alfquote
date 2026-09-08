#!/usr/bin/env node
/**
 * `alfquote` CLI entry point. Phase 2 placeholder: command parsing, output
 * modes, and exit codes arrive with the CLI work order. This shell exists so
 * the workspace wiring, bin resolution, and library dependency are real from
 * the start.
 */
import { pathToFileURL } from "node:url";
import { RESULT_SCHEMA_VERSION } from "alfquote";

export const CLI_VERSION = "0.1.0";

/** Commands implemented by later Phase 2 work orders. */
export const PLANNED_COMMANDS = ["discover", "assess", "quote", "swap"] as const;

export interface CliPlaceholderInfo {
  version: string;
  resultSchemaVersion: number;
  plannedCommands: readonly string[];
}

export function cliPlaceholderInfo(): CliPlaceholderInfo {
  return {
    version: CLI_VERSION,
    resultSchemaVersion: RESULT_SCHEMA_VERSION,
    plannedCommands: [...PLANNED_COMMANDS],
  };
}

function main(): number {
  const info = cliPlaceholderInfo();
  console.log(`alfquote ${info.version} — DualPool hook-aware quoting (result schema v${info.resultSchemaVersion})`);
  console.log(`Commands arrive with Phase 2 work orders: ${info.plannedCommands.join(", ")}.`);
  return 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exit(main());
}

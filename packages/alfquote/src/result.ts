/** Versioned command-result envelopes shared by every ALFQuote command surface. */

import type { NamespacedCode } from "./codes.js";

/**
 * Schema version of the result envelope. Bump on any breaking change to the
 * envelope shape so consumers (CLI, `uniswap-ai` skill) can branch on it.
 */
export const RESULT_SCHEMA_VERSION = 1;

export type CommandName = "discover" | "assess" | "quote" | "swap";

export type ResultStatus = "ok" | "skip" | "error";

/** Which chain state a result was computed against. */
export interface ChainBlockContext {
  readonly chainId: number;
  /** Pinned block number, or `null` when the read was latest-state. */
  readonly blockNumber: bigint | null;
  readonly blockSource: "pinned" | "latest";
}

/** Structured, machine-codeable warning; never fatal. */
export interface Warning {
  /** Namespaced `domain/reason` code, e.g. `"quote/view-drift"`. */
  readonly code: NamespacedCode;
  readonly message: string;
  readonly detail?: string;
}

/** Structured error carried by `error` results. */
export interface StructuredError {
  /** Namespaced `domain/reason` code, e.g. `"rpc/chain-mismatch"`. */
  readonly code: NamespacedCode;
  readonly message: string;
  readonly detail?: string;
}

/** Why a command declined to produce data without failing. */
export interface SkipReason {
  /** Namespaced `domain/reason` code, e.g. `"quote/zero-output"`. */
  readonly code: NamespacedCode;
  readonly message: string;
}

/** Base shape every command result shares. */
export interface ResultEnvelope<TInput extends object> {
  readonly schemaVersion: typeof RESULT_SCHEMA_VERSION;
  readonly command: CommandName;
  readonly chain: ChainBlockContext;
  /** Command-specific input summary; JSON-friendly by convention. */
  readonly input: TInput;
  readonly warnings: readonly Warning[];
  readonly status: ResultStatus;
}

export interface OkResult<TData, TInput extends object> extends ResultEnvelope<TInput> {
  readonly status: "ok";
  readonly data: TData;
}

export interface SkipResult<TInput extends object> extends ResultEnvelope<TInput> {
  readonly status: "skip";
  readonly skipped: SkipReason;
}

export interface ErrorResult<TInput extends object> extends ResultEnvelope<TInput> {
  readonly status: "error";
  readonly error: StructuredError;
}

export type CommandResult<TData, TInput extends object> =
  | OkResult<TData, TInput>
  | SkipResult<TInput>
  | ErrorResult<TInput>;

export function okResult<TData, TInput extends object>(
  command: CommandName,
  chain: ChainBlockContext,
  input: TInput,
  data: TData,
  warnings: readonly Warning[] = [],
): OkResult<TData, TInput> {
  return { schemaVersion: RESULT_SCHEMA_VERSION, command, chain, input, warnings, status: "ok", data };
}

export function skipResult<TInput extends object>(
  command: CommandName,
  chain: ChainBlockContext,
  input: TInput,
  skipped: SkipReason,
  warnings: readonly Warning[] = [],
): SkipResult<TInput> {
  return { schemaVersion: RESULT_SCHEMA_VERSION, command, chain, input, warnings, status: "skip", skipped };
}

export function errorResult<TInput extends object>(
  command: CommandName,
  chain: ChainBlockContext,
  input: TInput,
  error: StructuredError,
  warnings: readonly Warning[] = [],
): ErrorResult<TInput> {
  return { schemaVersion: RESULT_SCHEMA_VERSION, command, chain, input, warnings, status: "error", error };
}

export function isOkResult<TData, TInput extends object>(
  result: CommandResult<TData, TInput>,
): result is OkResult<TData, TInput> {
  return result.status === "ok";
}

export function isSkipResult<TData, TInput extends object>(
  result: CommandResult<TData, TInput>,
): result is SkipResult<TInput> {
  return result.status === "skip";
}

export function isErrorResult<TData, TInput extends object>(
  result: CommandResult<TData, TInput>,
): result is ErrorResult<TInput> {
  return result.status === "error";
}


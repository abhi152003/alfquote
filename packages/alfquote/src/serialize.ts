/**
 * Canonical JSON serialization for public result envelopes.
 *
 * `JSON.stringify` throws on the `bigint` values envelopes carry, so every
 * interface (CLI, skill, tests) must go through this one serializer instead
 * of inventing its own encoding. Canonical rules:
 *
 * - `bigint` becomes a decimal string (`25933348n` -> `"25933348"`).
 * - `undefined` object properties are dropped; `undefined` array slots
 *   become `null` (matching `JSON.stringify` semantics).
 * - Plain objects and arrays recurse in insertion order.
 * - Anything else (functions, symbols, class instances, Map/Set/Date)
 *   throws: a result envelope that cannot be represented canonically is a
 *   contract bug, not something to silently mangle.
 */

import type { CommandResult } from "./result.js";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Deep-convert a result-shaped value into JSON-safe data. */
export function toJsonValue(value: unknown): JsonValue {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "bigint") {
    return value.toString(10);
  }
  if (typeof value === "function" || typeof value === "symbol") {
    throw new TypeError(`cannot serialize ${typeof value} in a result envelope`);
  }
  if (Array.isArray(value)) return value.map(toJsonValue);
  if (typeof value === "object") {
    if (!isPlainObject(value)) {
      throw new TypeError(`cannot serialize ${value.constructor.name} in a result envelope`);
    }
    const out: { [key: string]: JsonValue } = {};
    for (const key of Object.keys(value)) {
      const entry: unknown = (value as Record<string, unknown>)[key];
      if (entry === undefined) continue;
      out[key] = toJsonValue(entry);
    }
    return out;
  }
  throw new TypeError(`cannot serialize value of type ${typeof value} in a result envelope`);
}

/** Serialize a command result to canonical, pretty-printed JSON text. */
export function serializeResult<TData, TInput extends object>(
  result: CommandResult<TData, TInput>,
): string {
  return JSON.stringify(toJsonValue(result), null, 2);
}

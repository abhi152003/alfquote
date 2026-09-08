/**
 * Shared namespaced code contracts for warnings, errors, and skips.
 *
 * Every `code` on a public result is spelled `domain/reason` in lowercase
 * kebab-case (e.g. `"quote/zero-output"`, `"rpc/read-failed"`). Work orders
 * own their domain registries (quote/*, assess/*, discover/*, swap/*); this
 * module owns the spelling rule and the cross-command codes.
 */

/** A `domain/reason` code string; the compile-time spelling contract. */
export type NamespacedCode = `${string}/${string}`;

/** Cross-command error codes every surface must use rather than re-spelling. */
export const COMMON_ERROR_CODES = [
  "input/invalid",
  "rpc/read-failed",
  "rpc/chain-mismatch",
  "rpc/block-unavailable",
] as const;

export type CommonErrorCode = (typeof COMMON_ERROR_CODES)[number];

/** Runtime validation for code strings arriving from untyped boundaries. */
export function isNamespacedCode(code: string): code is NamespacedCode {
  return /^[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)+$/.test(code);
}

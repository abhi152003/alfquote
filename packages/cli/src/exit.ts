/** Documented exit codes; keep in sync with README. */
export const EXIT_OK = 0;
/** Unexpected internal failure (sanitized message on stderr). */
export const EXIT_INTERNAL = 1;
/** The command returned a typed skip (e.g. zero quote, dead liveness). */
export const EXIT_SKIP = 2;
/** Invalid input: bad flags, addresses, amounts, or ranges. */
export const EXIT_INVALID_INPUT = 3;
/** The command could not produce evidence (error envelope, e.g. RPC failure). */
export const EXIT_UNAVAILABLE_EVIDENCE = 4;
/** Dry-run swap succeeded structurally but balance/allowance blockers exist. */
export const EXIT_BLOCKED = 5;
/** Configuration error (missing/invalid RPC, non-mainnet chain). */
export const EXIT_CONFIG = 6;

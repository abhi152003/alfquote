/**
 * Public surface of the `alfquote` library (main entry).
 *
 * Each work order owns its service module and adds `export * from` here when
 * it introduces one; per-module export lists are pinned by the matching test
 * in `test/surface/`, and `test/surface/barrel.test.ts` asserts the barrel is
 * exactly the union of its modules. Phase 1 fixture and diagnostic behavior
 * is deliberately NOT here — it lives behind the `alfquote/phase1` entry.
 *
 * Environment loading, console output, process exits, signers, broadcasts,
 * and Virtual-Environment admin access are out of the library by contract
 * (enforced by `scripts/check-package-boundaries.sh`).
 */

// --- Versioned command-result contracts (WO-12..15 consume; WO-9 owns) -----

export * from "./result.js";
export * from "./codes.js";
export * from "./serialize.js";

// --- Structured hook assessment (types; logic lands with WO-11) -----------

export * from "./assessment.js";

// --- Quote views (types; service lands with WO-12) --------------------------

export * from "./quote.js";

// --- Protected swap construction and simulation (types; WO-13) --------------

export * from "./swap.js";

// --- ABIs pinned from upstream source ----------------------------------------

export * from "./abis.js";

// --- Documented protocol addresses (fixture constants live in ./phase1.js) ---

export * from "./addresses.js";

// --- Pool identity and vanilla state ------------------------------------------

export * from "./pool.js";
export * from "./poolState.js";
export * from "./interfaceId.js";

// --- Discovery and provenance checks (WO-10 extends) ---------------------------

export * from "./discovery.js";
export * from "./hookChecks.js";

// --- ERC-20 reads and allowance snapshots --------------------------------------

export * from "./erc20.js";
export * from "./allowances.js";

// --- Negative-liquidity proof ----------------------------------------------------

export * from "./proofDecision.js";

// --- Universal Router v4 swap encoding (incl. quoteFillGapBps) -------------------

export * from "./v4Swap.js";

// --- Read-only simulation ---------------------------------------------------------

export * from "./simulateSwap.js";

// --- Output redaction utilities (pure) ----------------------------------------------

export * from "./output.js";

// `alfQuote.js` is mixed: its encoded-ALFHookData diagnostic is re-exported
// only from ./phase1.js, so this block must stay explicit rather than `*`.
export {
  readLiveness,
  readMaxGas,
  readHookStats,
  getIndicativeQuoteSafe,
  type HookStatsResult,
  type IndicativeQuoteResult,
} from "./alfQuote.js";

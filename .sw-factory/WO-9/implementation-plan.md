# Implementation Plan: WO-9

**Work Order:** WO-9 — Establish the ALFQuote workspace and public contracts
**Created At (UTC):** 2026-09-08T17:54:38Z

## Summary

Convert the single-package Phase 1 spike into an npm workspace with two packages —
`packages/alfquote` (reusable ESM TypeScript library) and `packages/cli` (command-line
interface placeholder) — while preserving every Phase 1 evidence path verbatim. Define the
versioned public contracts (command-result envelopes, chain/block context, structured
warnings/errors, and the PoolKey/PoolId/hook/assessment/quote/simulation types) that
WO-10…WO-15 build on. Add machine-enforced package boundaries so the library can never
grow environment access, console output, process exits, signers, broadcasts, or Tenderly
Admin references.

Source of truth: Phase 2 ALFQuote Library and CLI Plan (KB `40e5f328`), "Option B"
layout. Product scope preserved from ALFQuote and uniswap-ai skill wrap (KB `5ece3519`).

Branch: implemented directly on `main` (user-directed), based on `59fa267` — the merge
of PR #1 (WO-8 evidence chain) plus the review-coverage restore `3296191`. Main
therefore carries the final reviewed evidence behavior that the workspace split must
preserve. Commit/push remain user-directed.

## Code Reuse And Package Structure

Existing code is already cleanly layered — all `process.*`/`console.*` access lives in
the five entry scripts; every `src/` module is parameterized (env records and
`PublicClient` are passed in). The move is therefore mostly mechanical `git mv` +
import-specifier rewrites, verified by the strict compiler and the existing 90 tests.

### Placement map

| Current | New home | Rationale |
| --- | --- | --- |
| `src/{abis,abi/,addresses,alfQuote,allowances,discovery,erc20,hookChecks,interfaceId,output,pool,poolState,proofDecision,protectedSim,simulateSwap,v4Swap}.ts` | `packages/alfquote/src/` (same names) | Pure, client-injected, side-effect-free protocol behavior |
| `src/config.ts`, `src/client.ts`, `src/runOptions.ts` | `scripts/lib/` | Env/argv contracts and client construction are interface-layer concerns (Phase 2 plan assigns "environment and option validation" to the CLI package; evidence scripts keep their own copies here) |
| `src/tenderly/{config,adminClient,forkVerify,forkSetup,forkSwap,evidence}.ts` | `scripts/tenderly/` | Controlled-fork evidence tooling is a non-product path by design |
| `scripts/{verify-mainnet,prove-liquidity,simulate-swap,sweep-sizes}.ts` | `scripts/phase1/` | Preserved read-only verification tools |
| `scripts/fork-execute.ts` | `scripts/tenderly/fork-execute.ts` | Controlled-fork entry |
| `test/{abiEquivalence,allowances,interfaceId,pool,poolState,proofDecision,simulateSwap,v4Swap}.test.ts` + `test/fixtures/` | `packages/alfquote/test/` | Library tests live in the package |
| `test/{config,runOptions}.test.ts` | `scripts/lib/test/` | Script-support tests |
| `test/{tenderlyConfig,tenderlyIsolation,forkVerify,forkSetup,forkSwapEvidence,wo8Evidence}.test.ts` | `scripts/tenderly/test/` | Evidence-tooling tests |

`src/index.ts` is rewritten as the library's explicit public entry (see below). Scripts
import the library by workspace package name `alfquote` — never deep relative paths — so
the package boundary is real. Deep imports that exist today (`src/abis.js`,
`src/simulateSwap.js`, `src/output.js`) become public exports instead.

### Files created

- `packages/alfquote/package.json` — name `alfquote`, ESM, `exports` with
  `"types": "./src/index.ts"` (source types: `npm run type-check` works before any
  build, matching CI order) and `"import": "./dist/index.js"` (runtime uses built
  output).
- `packages/alfquote/tsconfig.json` (check: src+test, noEmit) and
  `packages/alfquote/tsconfig.build.json` (src only → `dist/` with declarations).
- `packages/alfquote/src/result.ts` — `RESULT_SCHEMA_VERSION`, `CommandName`,
  `ChainBlockContext`, `Warning`, `StructuredError`, `SkipReason`, per-status result
  variants and the `CommandResult` discriminated union, pure constructors
  (`okResult`/`skipResult`/`errorResult`) and type guards.
- `packages/alfquote/src/assessment.ts` — the four independent status unions
  (`CompatibilityStatus`, `ProvenanceStatus`, `RoutingStatus`, `UpgradeabilityStatus`),
  `AssessmentEvidence`, `AssessmentField<TStatus>`, `HookAssessment`, `AssessInput`, and
  a compile-time exact-keys assertion that the four fields are the only fields (no
  combined `safe` boolean can be added silently).
- `packages/alfquote/src/quote.ts` — `QuoteDirection`, `QuoteInput`,
  `IndicativeQuoteView`, `EffectiveLiquidityView`, zero-quote skip codes (types only;
  WO-12 implements the service).
- `packages/alfquote/src/swap.ts` — `SwapInput`, `ProtectedSwapPlan`,
  `SwapSimulationOutcome`, dry-run result types aligned with the existing
  `EncodedExecute`/`SimulateSwapResult` shapes (types only; WO-13 implements).
- `packages/cli/package.json` — name `@alfquote/cli`, bin `alfquote`, depends on
  workspace `alfquote`; `src/main.ts` placeholder + tsconfigs + minimal test.
- `scripts/check-package-boundaries.sh` — grep gate over `packages/alfquote/src/**`
  banning `process.env|process.argv|process.exit|console.`, signer/wallet/broadcast
  APIs, `node:fs|node:os|node:process` imports, and any case-insensitive `tenderly`
  mention (which also confines Admin method names).
- New tests: `packages/alfquote/test/exports.test.ts` (exact export-surface allowlist +
  package.json `exports` shape), `packages/alfquote/test/libraryBoundaries.test.ts`
  (source-scan purity assertions, ported from `tenderlyIsolation.test.ts`),
  `packages/cli/test/main.test.ts`.
- `tsconfig.base.json` (shared strict options), rewritten root `package.json`
  (workspaces, hoisted devDeps, pre-hooks that build the library before evidence
  scripts run), rewritten root `tsconfig.json` (scripts + co-located tests, noEmit),
  updated `vitest.config.ts` include globs.

### Files modified

- `scripts/check-no-send.sh` — rescope mainnet path to `packages/alfquote/src`,
  `packages/cli/src`, `scripts/phase1`, `scripts/lib`; tenderly path to
  `scripts/tenderly/**`.
- `scripts/release.sh` — add the package-boundary gate.
- `.github/workflows/phase1.yml` — add the package-boundary gate step.
- `README.md` — workspace layout, npm as the single documented manager,
  build-before-run note. `docs/pins.md` and `docs/fork-evidence.json` untouched.

## Components And Flow

Workspace dependency flow (single direction):

```text
packages/cli ──depends on──▶ packages/alfquote (workspace "alfquote") ──▶ viem
scripts/phase1/* ──import──▶ "alfquote" + scripts/lib/{config,client,runOptions}
scripts/tenderly/* ──import──▶ "alfquote" + scripts/lib/* + ./tenderly modules
```

Runtime resolution: scripts run under tsx with `--env-file-if-exists=.env` (unchanged
env contract — the user-owned `.env` is never touched). `import "alfquote"` resolves
through the npm-workspace symlink to `dist/index.js`, so each root evidence script gets
a `pre<script>` hook that builds the library first. Type resolution originally used `src/index.ts` so type-check could run before
build. **Superseded by the correction pass:** types now resolve to emitted
declarations and the root `type-check` script builds the library first, so the
same property holds with shippable manifests.

Public result envelope (the contract every WO-10…15 command returns):

```ts
interface EnvelopeBase<TInput> {
  schemaVersion: 1;              // RESULT_SCHEMA_VERSION
  command: "discover" | "assess" | "quote" | "swap";
  chain: ChainBlockContext;      // { chainId, blockNumber | null, blockSource }
  input: TInput;                 // command-specific input summary
  warnings: readonly Warning[];  // { code, message, detail? }
}
type CommandResult<TData, TInput> =
  | (EnvelopeBase<TInput> & { status: "ok"; data: TData })
  | (EnvelopeBase<TInput> & { status: "skip"; skipped: SkipReason })
  | (EnvelopeBase<TInput> & { status: "error"; error: StructuredError });
```

Assessment exposes `compatibility`, `provenance`, `routing`, `upgradeability` as
independent `AssessmentField` values (status + evidence list); there is deliberately no
`safe` field anywhere in the public surface.

## Steps

1. **Cut branch + moves** - `feat/wo-9-workspace`; `git mv` all files per the placement
   map.
2. **Workspace plumbing** - root `package.json` (workspaces, renamed to
   `alfquote-workspace`, pre-hooks), `tsconfig.base.json`, package `package.json` +
   tsconfigs, `vitest.config.ts`; `npm install` to refresh the lockfile and symlinks.
3. **Import rewrite pass** - compiler-driven: scripts import `"alfquote"` + relative
   `../lib/*`; tenderly modules import relatively within `scripts/tenderly`; tests
   import their co-located modules.
4. **Public contracts** - write `result.ts`, `assessment.ts`, `quote.ts`, `swap.ts`;
   rewrite `packages/alfquote/src/index.ts` as the explicit public surface (existing
   exports minus `config`/`client`/`runOptions`, plus `decodeRevert`, the ABI objects
   scripts deep-imported, and the new contract modules).
5. **CLI placeholder package** - `packages/cli` bin stub that reports the Phase 2
   command surface as not yet implemented.
6. **Boundary enforcement** - `scripts/check-package-boundaries.sh`, rescoped
   `check-no-send.sh`, ported `libraryBoundaries.test.ts`, `exports.test.ts`; wire into
   `release.sh` and CI.
7. **Docs** - README workspace section.
8. **Verification + review** - full matrix below, then the WO-9 review phase.

## Testing

Automated (offline):

- `npm run type-check` — root scripts program + both workspace programs.
- `npm run build` — library dist with declarations; CLI dist.
- `npm test` — all 90 existing tests at their new locations + new boundary/export
  surface/CLI tests (vitest globs `packages/*/test/**` and `scripts/**/test/**`).
- `bash scripts/check-no-send.sh` — rescoped Phase 1 no-send gate.
- `bash scripts/check-package-boundaries.sh` — new library purity gate (must fail when
  seeded with a violation, verified once by temporary mutation, then reverted).

Live read-only (env already configured by the user; no `.env` changes):

- `npm run spike`, `npm run proof`, `npm run simulate` — confirm the Phase 1 evidence
  commands still run end-to-end through the workspace (all are read-only: pinned-block
  reads and `eth_call` simulation).
- `npm run fork` is intentionally NOT re-run: release evidence is single-shot per
  address (re-runs fail validation on skipped approvals by design); its preserved
  reproducibility is covered by the offline suite plus the unchanged artifact.

Manual: fresh-checkout simulation (`npm ci && npm run type-check && npm run build &&
npm test && both gates`) validates the "installs from a clean checkout" requirement.


## Correction pass (post-commit 02ae0bb, user-directed)

User review of 02ae0bb requested seven corrections before WO-10..13 start; all applied:

1. **Manifest type paths** — both packages' `exports["."].types` (and the CLI entry) now point at shipped declarations (`./dist/index.d.ts`, `./dist/phase1.d.ts`, `./dist/main.d.ts`). Root `type-check` builds the library first so `npm ci && npm run type-check` still works before any build.
2. **Canonical JSON** — new `serialize.ts` (`toJsonValue`, `serializeResult`): bigint → decimal string, undefined-dropped semantics, throws on non-representable values; round-trip tests pin the encoding.
3. **`PoolId`** — defined in `pool.ts`, used by `quote.ts`, `swap.ts`, `assessment.ts`, and the phase1 fixture constants.
4. **Namespaced codes** — new `codes.ts`: `NamespacedCode` (`domain/reason`) types the `Warning`/`StructuredError`/`SkipReason` codes, `COMMON_ERROR_CODES` registry, `isNamespacedCode` validator.
5. **`alfquote/phase1` sub-entry** — fixture constants (moved out of `addresses.ts`), the encoded-ALFHookData diagnostic, and the fixture-locked `runProtectedSimulation` (folded in from the deleted `protectedSim.ts`) live behind `./phase1`; the main entry stays pool-agnostic. `quoteFillGapBps` moved to `v4Swap.ts` (generic math, stays main).
6. **Fixture-adapter ownership** — documented in `phase1.ts`: WO-12 owns generic quote services, WO-13 owns generic swap planning/simulation; the fixture adapter stays on the phase1 path until they land.
7. **Per-owner surface tests** — `packages/alfquote/test/surface/` splits the allowlist by feature owner (`result`, `domains`, `protocol`, `barrel`); the barrel is `export *` per module plus one explicit `alfQuote.js` block, and `barrel.test.ts` computes the union dynamically so adding a module export does not conflict across work orders.

Plus `docs/pins.md` path fixes (`packages/alfquote/...`, phase1 homes) and a README note for the subpath.

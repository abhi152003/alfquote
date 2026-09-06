<!--lint disable no-undefined-references strong-marker-->

# Implementation Plan: WO-1

**Work Order:** WO-1 — Initialize the ALFQuote TypeScript spike workspace
**Created At (UTC):** 2026-09-06T11:34:38Z

## Summary

Scaffold the minimal TypeScript + viem workspace in the `alfquote` repository so the go/no-go mainnet verification spike (WO-2, WO-3, WO-4) has a reproducible home. This Work Order adds no on-chain behavior: the deliverable is a root package with pinned tooling, a single runtime dependency (`viem`), a lightweight test runner (`vitest`), an RPC-URL environment contract with strict validation, and a spike entry script that currently only validates configuration and reports scaffold status. Package manager is npm (user-confirmed; no extra tooling beyond Node itself); runtime requirement is Node >= 22.9 (for `--env-file-if-exists`). The existing README, plan doc, MIT license, and git history are preserved and only extended, never rewritten.

## Code Reuse And Package Structure

Existing assets reused directly:

- `.gitignore` — already ignores `node_modules/`, `dist/`, `.env`/`.env.*` (with `!.env.example`), `*.tsbuildinfo`, and `coverage/`. No changes needed.
- `README.md` — preserved; extended with a workspace-setup section (commands, Node/npm requirements, env contract).
- `LICENSE` (MIT) and `docs/ALFQuote.md` — untouched. The Knowledge Base copy of the plan ("ALFQuote and uniswap-ai skill wrap") is the authoritative blueprint; the repo copy is the local snapshot.
- Git history — one commit on `main`; no rewrites, no force operations.

New files created (root-level single package, matching the Work Order's "root TypeScript package" scope; the `packages/alfquote` library restructure belongs to Phase 2):

| Path | Purpose |
| --- | --- |
| `package.json` | Root package `alfquote`: `type: module`, `engines.node`, and the four required command groups plus `build` |
| `package-lock.json` | Generated lockfile for reproducible clean-checkout installs |
| `tsconfig.json` | Strict TypeScript, `NodeNext` modules, `ES2023` target, covers `src/`, `scripts/`, `test/` |
| `vitest.config.ts` | Minimal Vitest configuration bound to `test/**/*.test.ts` |
| `.env.example` | Documents `ETHEREUM_RPC_URL` with usage notes; no secrets |
| `src/config.ts` | Environment contract: typed parsing + strict validation of the RPC URL |
| `src/index.ts` | Library entry; re-exports config surface so later phases grow the library from one root |
| `src/abi/README.md` | Documents that pinned read-only ABI JSON files (IALFHook, AllowlistedFactory, PoolManager) land here in WO-2; explicitly no bytecode |
| `scripts/verify-mainnet.ts` | The spike entry (`npm run spike`): validates env, prints scaffold status; on-chain checks arrive with WO-2 |
| `test/config.test.ts` | Unit tests for the env validation contract |

Dependencies: runtime `viem`; dev `typescript`, `tsx`, `vitest`, `@types/node`.

## Components And Flow

**`src/config.ts`** — the only behavioral code in this Work Order.

```ts
export class SpikeConfigError extends Error { ... }  // actionable, names the variable and the fix

export interface SpikeConfig {
  rpcUrl: string;       // normalized http(s) or ws(s) URL
  chainId: 1;           // spike is mainnet-only by definition
}

export function loadSpikeConfig(env: Record<string, string | undefined>): SpikeConfig;
```

Validation rules (fail-closed, per the blueprint's "fail closed and report reason" posture):

1. `ETHEREUM_RPC_URL` missing or empty → `SpikeConfigError` telling the user to `cp .env.example .env` and set a mainnet RPC URL.
2. Present but not parseable, or protocol not `http:`/`https:`/`ws:`/`wss:` → `SpikeConfigError` naming the invalid value and accepted schemes.

**`scripts/verify-mainnet.ts`** — flow: `loadSpikeConfig(process.env)` → on failure print the error to stderr with a pointer to `.env.example` and `process.exit(1)`; on success print a scaffold banner (workspace ready, viem installed, no on-chain checks in WO-1) and exit `0`. No network calls in this phase, so a syntactically valid placeholder URL passes — the acceptance criterion is the clear failure mode, not connectivity.

**Wiring**: `package.json` scripts use `node --import tsx --env-file-if-exists=.env` so `.env` is honored without a dotenv dependency. `npm run spike` and `npm run dev` (watch mode) both run the script; `npm test` runs Vitest; `npm run type-check` runs `tsc --noEmit`; `npm run build` emits to `dist/`.

## Steps

1. **Toolchain foundation** — create `package.json` + `tsconfig.json`; `npm install` with `viem`, `typescript`, `tsx`, `vitest`, `@types/node`.
2. **Environment contract** — add `.env.example` and `src/config.ts` (validation contract + `SpikeConfigError`).
3. **Spike entry + library root** — add `scripts/verify-mainnet.ts`, `src/index.ts` re-export, `src/abi/README.md`.
4. **Tests** — add `vitest.config.ts` and `test/config.test.ts`.
5. **Docs** — extend `README.md` with setup + commands; leave existing content intact.
6. **Verification pass** — run the full manual matrix below; fix anything found.

Steps 2–5 are independent of each other once step 1 lands.

## Testing

Automated (`npm test`, Vitest):

- `loadSpikeConfig({})` (missing var) throws `SpikeConfigError` whose message contains `ETHEREUM_RPC_URL` and `.env.example`.
- Empty-string value throws the same way.
- Non-URL (`not-a-url`) and wrong-scheme (`ftp://example`) values throw with the accepted-scheme list in the message.
- Valid `https://` and `wss://` URLs return a config with the URL passed through.

Static (`npm run type-check`): `tsc --noEmit` over `src/`, `scripts/`, `test/`, `vitest.config.ts`.

Manual / exploratory (the WO's real acceptance surface):

- `npm run spike` with no `.env` → non-zero exit, single clear stderr message, no stack-trace noise.
- `ETHEREUM_RPC_URL=https://eth.example.invalid npm run spike` → exit `0` scaffold confirmation (proves the happy path parses without requiring network).
- Clean-checkout install: remove `node_modules` and reinstall with npm; then `npm run type-check && npm test` still green.

Out of scope for tests here: any RPC connectivity, viem client behavior, ABI reads (WO-2+).

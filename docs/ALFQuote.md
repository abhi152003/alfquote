# ALFQuote

## Plan summary

ALFQuote is a TypeScript library and command-line interface for discovering, assessing, and quoting Uniswap v4 DualPool hooks through `IALFHook` views. A companion skill for `Uniswap/uniswap-ai` teaches agents to use the same integration rules.

DualPool keeps just-in-time (JIT) inventory in ERC-4626 vaults. PoolManager can therefore report little or no vanilla liquidity between swaps even when the hook can provide a valid quote. ALFQuote exposes the hook-aware path without deploying new hook bytecode.

## 1. Purpose and boundaries

The product gives router, wallet, and agent developers a reproducible DualPool integration path:

1. Discover factory deployments and pools.
2. Report compatibility, provenance, and routing-review status separately.
3. Read effective liquidity and indicative quotes through `IALFHook`.
4. Build and simulate standard Uniswap v4 swap calldata with empty `hookData`.
5. Teach the same safety rules through a contribution to `Uniswap/uniswap-ai`.

Do not write a new hook, change DualPool bytecode, or deploy unaudited hook code.

## 2. Problem

DualPool is a Uniswap v4 hook built by Uniswap Labs with Spark. Idle inventory sits in ERC-4626 vaults. A swap withdraws funds, deploys concentrated liquidity for execution, and returns the funds to the vaults afterward.

Between swaps, `getSlot0` can show a price while PoolManager `getLiquidity` is zero or near zero. Integrators that use vanilla depth as their only capacity signal can miss usable JIT inventory. Official DualPool guidance requires hook-aware quote views. Execution remains a standard v4 swap.

This creates three separate questions that integrators often mix together:

* **Compatibility:** Does the hook implement the expected `IALFHook` surface?
* **Provenance:** Does the official factory attest the deployed bytecode?
* **Routing review:** Does current Uniswap Labs policy require manual review for the hook or pair?

`hooklist` is a public catalog. It is not the Uniswap Labs routing allowlist. Current routing guidance can require manual review when a hook uses return-delta or dynamic-fee behavior, has an address starting with `0x91`, or targets a major pair such as ETH/USDC.

The plan does not assume that the Trading API skips DualPool. If we make that claim in `FEEDBACK.md`, we must support it with a reproducible request and response. Otherwise, describe only the verified integration gap: vanilla liquidity is not sufficient for DualPool capacity.

## 3. Proposed solution

### Deliverables

| Part | Path or name | Purpose |
| --- | --- | --- |
| Library | `packages/alfquote` | Discover hooks and pools, assess them, read quotes, and build swap calldata |
| CLI | `alfquote` | Expose the same operations from a shell |
| Tests | Unit tests and optional `test/fork` | Preserve recorded call behavior and live integration facts |
| Skill | `packages/plugins/uniswap-trading/skills/alf-quote/` | Teach agents the correct DualPool integration path |
| Docs | `README.md`, `FEEDBACK.md` | Explain the integration and record documented facts versus observed behavior |

### Contracts and documented addresses

| Contract | Source | Role |
| --- | --- | --- |
| `AllowlistedFactory` | [src/AllowlistedFactory.sol](https://github.com/Uniswap/v4-hooks-public/blob/main/src/AllowlistedFactory.sol) | CREATE2 deployer and registry |
| `DualPoolHook` | [src/alf/DualPoolHook.sol](https://github.com/Uniswap/v4-hooks-public/blob/main/src/alf/DualPoolHook.sol) | JIT DualPool hook |
| `OwnedALFHook` | [src/alf/base/OwnedALFHook.sol](https://github.com/Uniswap/v4-hooks-public/blob/main/src/alf/base/OwnedALFHook.sol) | Per-pool `livePools` |
| `IALFHook` | [src/alf/interfaces/IALFHook.sol](https://github.com/Uniswap/v4-hooks-public/blob/main/src/alf/interfaces/IALFHook.sol) | Quote surface |
| `PoolManager` | Uniswap v4 core | Swap execution and vanilla `getLiquidity` |

| Name | Documented Ethereum address |
| --- | --- |
| AllowlistedFactory | `0x0000000000077769C332e0D3ed8bC8E02A0cE108` |
| PoolManager | `0x000000000004444c5dc75cB358380D2e3dE08A90` |
| Universal Router v4 | `0x66a9893cc07d91d95644aedd05d03f95e1dba8af` |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |

Reverify bytecode and official documentation during the go/no-go spike. Do not assume these addresses apply to another chain.

### Demo fixture

| Name | Value |
| --- | --- |
| DualPoolHook | `0x00000078BD49D5279a99b5F4011a5C61eE8caaC0` |
| Pool ID | `0xf32349cbc41fec9d3194f2b4e9ee72ded0bfda412427be9cb8a4087f74bdb065` |
| Fee | 10 pips |
| Pair | USDC and USDT |

This example hook predates the factory and is not factory-attested. Use it only if current live checks pass, and report `provenance: fixture`.

### Excluded work

* New or modified hook bytecode
* Hosted Trading API or routing-service changes
* Wallet UI
* Treating `hooklist` as a routing allowlist

## 4. How the solution works

The library has four stages: discover, assess, quote, and simulate. Sending a live swap is an optional final step.

### Discover

Read `allDeployments()` and `Deployed` events from the documented factory. For each hook:

1. Call `factory.isFromFactory(hook)`.
2. Call `hook.factory()` and compare the result with the documented factory.
3. Find pools from hook `PoolCreated` events or PoolManager `Initialize` events filtered by hook address.
4. Check ERC-165 support for `IALFHook`.

```solidity
bool isAlf = IERC165(address(key.hooks)).supportsInterface(type(IALFHook).interfaceId);
```

A two-way factory match establishes factory provenance. It does not establish operator trust, vault safety, routing status, or current liveness. If ERC-165 or required view calls fail, report compatibility as `unsupported` or `unverified` and do not quote.

### Assess

Do not collapse compatibility, provenance, and routing policy into one `route-safe` label. Return a structured assessment with independent fields.

| Field | Values | Meaning |
| --- | --- | --- |
| `compatibility` | `supported`, `unsupported`, `unverified` | Whether ERC-165 and the required `IALFHook` calls establish a usable quote surface |
| `provenance` | `factory`, `fixture`, `unknown` | Whether the official factory attests the hook, the address is an explicit demo fixture, or provenance is not established |
| `routing` | `automatic`, `manual-review`, `unknown` | Whether current Uniswap Labs guidance indicates automatic handling, manual review, or insufficient evidence |
| `upgradeability` | `not-detected`, `detected`, `unverified` | Result of conservative proxy checks |

Routing status is `manual-review` when current policy applies, including return-delta or dynamic-fee behavior, an address starting with `0x91`, or a major pair such as ETH/USDC. Do not infer routing status from `hooklist`.

Proxy detection must check known patterns such as EIP-1967, beacon, UUPS, and EIP-1167 minimal proxies. These checks cannot prove that a contract is immutable. Return `unverified` when evidence is incomplete.

A hook can be quote-compatible without factory provenance. A factory match attests deployed bytecode provenance only. It does not attest the operator, vaults, assets, or current routing status.

The CLI and skill must refuse to recommend execution when compatibility is not `supported`, upgradeability is `detected` or `unverified`, per-pool liveness fails, or the quote is zero. Size candidate fills from `getEffectiveLiquidity`, not `getReserves`.

### Quote

All quote methods are views. Use static calls and cap each quote call with the current `maxGas()` value.

| Function | Use |
| --- | --- |
| `getIndicativeQuote` | Rank a pool for a requested amount |
| `swapToPrice` | Simulate a price-bounded fill |
| `getEffectiveLiquidity` | Size the candidate fill from currently usable assets |
| `getReserves` | Show total assets, not immediately usable capacity |
| `livePools` | Check per-pool liveness |
| `isLive` | Read hook-level liveness |
| `maxGas` | Bound quote-call gas |

The README must link each function to its current source line. Line anchors drift, so recheck them against the pinned source revision rather than treating any line number as permanent.

Rules from the official router guide:

* `amountSpecified` is negative for exact input and positive for exact output.
* `zeroForOne = true` swaps `currency0` to `currency1`.
* Pass empty bytes as DualPool `hookData`.
* Read the fee from `key.fee`; do not use the dynamic-fee flag.
* Treat a zero quote as a skip.
* Use `livePools(poolId)` for per-pool state. Do not rely only on hook-level `isLive()`.

The negative-liquidity proof reads vanilla PoolManager liquidity and hook-aware effective liquidity for the same pool. The expected evidence is zero or near-zero vanilla liquidity, positive effective liquidity, and a positive indicative quote. Record the actual values and block number.

### Simulate and optionally execute

Execution is a standard v4 swap. Use Universal Router command `V4_SWAP`. Use actions `SWAP_EXACT_IN_SINGLE`, `SETTLE_ALL`, and `TAKE_ALL`. Pass `hookData: ""`. Set `amountOutMinimum` from the indicative quote minus slippage. Do not send the raw quote as the user bound. Quotes are not a firm price.

You can also call `PoolManager.swap` inside `unlockCallback`.

Size the simulation from the quote and keep the amount small. Record the gas estimate from the current simulation. Prior observations on the example pool are not a fixed production guarantee.

A successful simulation with empty `hookData` is the required deliverable. A live mainnet swap is a stretch goal. Send only when simulation succeeds and balances, allowances, slippage, gas cost, and human approval are all confirmed.

Use the asset form supported by the chosen pool and execution path. Do not generalize fixture-specific behavior to all ALF hooks.

### CLI surface

| Command | Action |
| --- | --- |
| `alfquote discover --chain 1` | List factory hooks and pools |
| `alfquote assess --hook <addr> [--pool <id>]` | Print separate compatibility, provenance, routing, and upgradeability results |
| `alfquote quote --pool <id> --amount <n>` | Print indicative quote and effective liquidity |
| `alfquote swap --pool <id> --amount <n>` | Build and simulate a swap; send only with an explicit flag and approval |

### uniswap-ai skill

Fork [Uniswap/uniswap-ai](https://github.com/Uniswap/uniswap-ai). Add `alf-quote` under the `uniswap-trading` plugin:

```text
packages/plugins/uniswap-trading/skills/alf-quote/SKILL.md
```

Follow the current repository contribution rules:

1. Add `SKILL.md` with all required frontmatter, including name, description, license, and author metadata.
2. Register the skill in `packages/plugins/uniswap-trading/.claude-plugin/plugin.json`.
3. Bump the plugin version in both `plugin.json` and `package.json`.
4. Add the matching skill documentation page and update the skill and plugin indexes.
5. Add a Promptfoo evaluation suite under `evals/suites/alf-quote/` using the repository's current Nx layout.
6. Run plugin validation, documentation validation, lint, build, tests, and the affected evaluation suite.
7. Meet the repository's current evaluation pass threshold before opening the pull request.

The skill must instruct agents:

* Do not use vanilla `getLiquidity` as DualPool capacity.
* Use `IALFHook` views and per-pool liveness.
* Pass empty `hookData` for DualPool.
* Assess compatibility, provenance, routing, and upgradeability separately.
* Treat a zero quote as a skip.
* Require explicit human approval before any live swap.

Do not claim that the Trading API skips DualPool unless a reproducible request and response demonstrate that behavior.

## 5. Users

Primary users are router and aggregator engineers. They need a copy-paste quote path that matches official DualPool docs.

Secondary users are wallet engineers. They need a structured assessment before they show a hooked pool as a route.

Tertiary users are AI agents. They load `alf-quote` from `uniswap-ai` and generate integrator code that does not mistake empty vanilla liquidity for absent DualPool capacity.

The library can ship as a public package. The skill pull request can merge into Uniswap/uniswap-ai. Integrators can quote factory DualPool hooks without a new unaudited hook. DualPool inventory can reach more swappers. The operator still keeps vault yield between swaps.

This project does not replace Labs route logic.

## 6. Scope and release gates

### Required scope

* Ethereum mainnet reads against the official factory and a verified DualPool or clearly labeled fixture.
* TypeScript library and CLI with viem.
* Structured assessment with separate compatibility, provenance, routing, and upgradeability results.
* Negative-liquidity proof using live reads.
* Non-zero indicative quote for a small demo amount.
* Universal Router calldata and successful simulation with empty `hookData`.
* `uniswap-ai` skill, documentation, evaluation suite, repository validation, and pull request.
* `README.md`, `FEEDBACK.md`, and a public open-source license.

### Stretch scope

* One small live mainnet swap after successful simulation and explicit approval.
* Optional Foundry fork test.
* Optional issue for fixture metadata. Do not block on it.

### Out of scope

* New or modified hook bytecode.
* Multi-chain support.
* Hosted Trading API or routing-service changes.
* Wallet user interface.
* Full tick-walk quoting, vault selection, or LP operator tooling.

### Pre-implementation go/no-go spike

Before library implementation, verify all of the following against current mainnet state:

1. The documented factory address has contract bytecode.
2. `allDeployments()` and `Deployed` logs can be read.
3. At least one hook is usable, either factory-attested or explicitly labeled as a fixture.
4. The current `IALFHook` ABI and interface ID are pinned from source.
5. ERC-165 compatibility succeeds on the demo hook.
6. `livePools`, `maxGas`, `getLiquidity`, `getEffectiveLiquidity`, and `getIndicativeQuote` can be read.
7. Vanilla liquidity is zero or near zero while effective liquidity and the indicative quote are positive.
8. A small Universal Router swap with empty `hookData` simulates successfully.

Proceed when checks 1–7 pass. Check 8 is the target release gate. If simulation initially fails, continue only when the revert identifies a correctable integration issue and the read-only proof remains valid. If no usable hook or non-zero quote exists, stop and reassess the project instead of building against mocks.

## 7. Build plan

### Phase 1: verify and pin

1. Create the public repository, add an MIT license, and preserve a useful commit history.
2. Pin the current source revisions for `v4-hooks-public` and `uniswap-ai`.
3. Run the complete go/no-go spike from Section 6.
4. Record addresses, ABI revision, interface ID, pool key, live call results, and simulation output in `docs/pins.md`.
5. Stop or revise the project if no usable hook, positive effective liquidity, or non-zero quote exists.

### Phase 2: library core

1. Scaffold `packages/alfquote` with TypeScript and viem.
2. Implement factory discovery and pool discovery.
3. Implement ERC-165 compatibility and two-way provenance checks.
4. Implement conservative proxy checks with `unverified` fallback.
5. Add unit tests using recorded fixtures.

### Phase 3: quote and assessment

1. Implement `maxGas`, `livePools`, `getEffectiveLiquidity`, `getReserves`, `getIndicativeQuote`, and `swapToPrice` wrappers.
2. Implement the structured assessment fields.
3. Treat a zero quote or failed per-pool liveness check as a skip.
4. Add the negative-liquidity proof and optional fork test.
5. Document the limits of each signal.

### Phase 4: CLI and simulation

1. Implement `discover`, `assess`, `quote`, and `swap` commands.
2. Make swap execution dry-run by default.
3. Encode `V4_SWAP` with `SWAP_EXACT_IN_SINGLE`, `SETTLE_ALL`, `TAKE_ALL`, and empty `hookData`.
4. Derive `amountOutMinimum` from the quote and an explicit slippage setting.
5. Print calldata, assessment, quote, effective liquidity, gas estimate, and simulation result.
6. Record actual gas estimates as observations, not fixed guarantees.

### Phase 5: uniswap-ai contribution

1. Add the `alf-quote` skill with complete frontmatter.
2. Update both plugin version files, skill documentation, plugin documentation, and indexes.
3. Add an Nx-compatible Promptfoo evaluation suite.
4. Include cases for vanilla-liquidity misuse, zero quotes, uncertain provenance, proxy uncertainty, empty `hookData`, and the human approval gate.
5. Run all repository validations, lint, build, tests, and affected evaluations.
6. Fix failures before opening the pull request.

### Phase 6: documentation and freeze

1. Complete the README contract map and recheck source-line links.
2. Write `FEEDBACK.md` using only claims supported by documentation or recorded evidence.
3. Open the `uniswap-ai` pull request and link it from the README.
4. If simulation, funds, allowances, slippage, gas, and human approval are all safe, send one small swap and record its transaction hash.
5. Keep the successful simulation as the primary proof even if no transaction is sent.

Keep this contract map in `README.md`. Readers must be able to move from each claim to the current source.

| README heading | Evidence |
| --- | --- |
| Factory discovery | `AllowlistedFactory`: `allDeployments`, `isFromFactory`, and `Deployed` |
| Compatibility | ERC-165 and the `IALFHook` interface ID |
| Indicative quote | Current `getIndicativeQuote` source |
| Price-bounded quote | Current `swapToPrice` source |
| Effective liquidity | Current `getEffectiveLiquidity` source |
| Per-pool liveness | Current `livePools` source |
| Negative liquidity | PoolManager vanilla `getLiquidity` read and matching hook-aware reads |
| Simulation | Universal Router `V4_SWAP` with empty `hookData` and slippage protection |

`FEEDBACK.md` must distinguish documented facts from observed behavior. Include the vanilla-liquidity integration gap, the need for caller-side hook compatibility checks, and the difference between `hooklist` and routing policy. Include Trading API behavior only when a reproducible request and response support the claim.

## 8. Demo script

1. State the problem: vanilla PoolManager liquidity can miss DualPool JIT capacity.
2. Run `alfquote discover --chain 1` and show a factory deployment or clearly labeled fixture.
3. Run `alfquote assess` and show compatibility, provenance, routing, and upgradeability as separate results.
4. Show the negative-liquidity proof: vanilla liquidity is zero or near zero while effective liquidity is positive.
5. Run `alfquote quote` for a small exact input and show a non-zero indicative quote.
6. Show simulated Universal Router calldata with empty `hookData`, slippage protection, and the current gas estimate.
7. If a live swap was safely completed, show its transaction hash briefly. Do not make it the main proof.
8. Show the `alf-quote` skill rule that forbids vanilla-liquidity-only routing and requires human approval.
9. Show the README links and the `uniswap-ai` pull request.
10. Close with the scope: integrator tooling and an upstream skill, with no new hook bytecode.

If the factory list is empty, use the example hook as a fixture. State clearly that factory provenance is not established for that address.

## 9. Risks and cautions

CAUTION: Do not deploy a new unaudited hook. A hook bug can lock or drain pool funds. Use the audited DualPool bytecode from v4-hooks-public.

CAUTION: Factory attestation is bytecode provenance only. It is not operator trust. A hostile owner can pause pools or set vaults that fail to withdraw.

CAUTION: Size fills from `getEffectiveLiquidity`. Vault pause, cap, or utilization can make effective liquidity lower than reserves. An oversized swap can revert on vault withdraw.

CAUTION: `getIndicativeQuote` is not a firm price. DualPool uses a single-step simulation. A large swap can diverge. Always set `amountOutMinimum`.

CAUTION: DualPool swap gas can be high. Use the current simulation estimate and record it as an observation. If simulation fails, do not send.

CAUTION: The example hook is not in the factory. Do not label it factory-attested. Label it as a fixture.

CAUTION: USDT allowance must go to 0 before a new non-zero allowance. USDC and USDT use 6 decimals. Read `decimals()`. Do not assume 18.

CAUTION: `isLive()` on DualPool is always true. A paused pool still needs `livePools(poolId)` or a `0` quote.

CAUTION: Do not send the skill’s agent a live swap without human approval. The official swap-integration skill already needs user approval before the user spends gas.

Risk: factory has no deployments on demo day. Mitigation: use the example hook as a fixture. Still run ERC-165 and quote views.

Risk: the uniswap-ai pull request does not merge. Mitigation: the fork and the pull request URL still show the official repository contribution.

Risk: mainnet swap reverts after a successful quote. Mitigation: make simulation the required proof and the live send optional. Keep the amount small. Record revert evidence as diagnostic data, not as the intended final result.

Risk: proxy checks miss an uncommon upgrade pattern. Mitigation: report `unverified` when immutability is not established. Never convert incomplete evidence into `not-detected`.

Risk: a routing-policy rule changes before freeze. Mitigation: recheck current Uniswap routing guidance at freeze and keep routing status separate from compatibility and provenance.

Risk: Labs routes still skip DualPool after this work. Mitigation: this project is integrator tools. It does not claim a Labs router change.

## 10. Success checks

### Product proof

* [ ] The documented factory address has bytecode and its discovery calls are recorded.

* [ ] At least one demo hook is factory-attested or clearly labeled as a fixture.

* [ ] ERC-165 and the required `IALFHook` calls establish `compatibility: supported`.

* [ ] Compatibility, provenance, routing, and upgradeability are reported separately.

* [ ] Uncertain proxy evidence produces `upgradeability: unverified`.

* [ ] The negative-liquidity proof shows zero or near-zero vanilla liquidity and positive effective liquidity.

* [ ] `getIndicativeQuote` returns a non-zero value for the demo amount.

* [ ] A zero quote and failed per-pool liveness both produce a skip.

* [ ] Swap calldata uses empty `hookData` and an explicit slippage bound.

* [ ] A small swap simulation succeeds and its gas estimate is recorded.

* [ ] Any live swap was separately approved and is treated as optional evidence.

### Upstream contribution

* [ ] `SKILL.md` has the complete required frontmatter.

* [ ] `plugin.json` and `package.json` versions match.

* [ ] Skill docs, plugin docs, and indexes include `alf-quote`.

* [ ] Plugin and documentation validation, lint, build, tests, and affected evaluations pass.

* [ ] Evaluations cover vanilla-liquidity misuse, zero quotes, uncertain provenance, proxy uncertainty, empty `hookData`, and human approval.

* [ ] The evaluation suite meets the repository's current pass threshold.

* [ ] The README links the `Uniswap/uniswap-ai` pull request.

### Documentation

* [ ] The public repository has an open-source license and useful commit history.

* [ ] The README points to the current relevant contracts and source lines.

* [ ] `FEEDBACK.md` contains only documented or reproducible claims.

* [ ] No new hook bytecode is included.

If every required check passes, the project is ready to ship. A live transaction hash is not required.

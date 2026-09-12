<!--lint disable strong-marker-->

# Work Order Entity Index: WO-16

**Initialized At (UTC):** 2026-09-12T14:10:07Z
**Current Status:** in_progress

## Work Order

- WO-16: Establish the uniswap-ai upstream baseline and public distribution gate (`b1864c89-2d29-4607-8bb5-269d5fd275b0`)

## Requirements

## Blueprints

- Phase 3 ALFQuote uniswap-ai Contribution Plan (`06b9be68-abcb-4c0f-a1e8-eb35f26e38c2`)
- ALFQuote and uniswap-ai skill wrap (ALFQuote.md) (`5ece3519-fde3-4e98-ae75-e177325d12a5`)

## Referenced Blueprints

Blueprints reached through `@…` mentions and links while reading linked blueprints.

- Uniswap Internals for Building ALFQuote (`5651dfe0-ed49-4e3d-9d25-67dec1bba0b4`)
- github.com-Uniswap-uniswap-ai snapshot (`4f6a78df-8f5e-455d-ba5b-0c95832aaa15`)

## Delivery

- Branch: `main` (execution artifacts only; no product code changes in WO-16)
- Pull Request URL: https://github.com/abhi152003/alfquote (public repo URL; the upstream PR is WO-21 scope)
- Public repo: https://github.com/abhi152003/alfquote (PUBLIC, MIT)
- Pinned revision: tag `phase2-baseline` → `18636e20a214c6950152454a1656ad85714b25c5` (certified: type-check, 235/235 tests, both gates)
- Upstream: `Uniswap/uniswap-ai` main = `5338d6edb6a5948d05701c4b295139a0b74efb92` (2026-09-08; identical to planning snapshot)
- Fork: https://github.com/abhi152003/uniswap-ai — branch `feat/alf-quote-skill` cut from current `upstream/main`; local clone `/home/abhip05/Documents/eth-online-26/uniswap-ai`
- Contribution map: `.sw-factory/WO-16/upstream-baseline.md`

## Notes

- Local readiness gaps recorded for WO-17+: bun not installed on this machine; ANTHROPIC_API_KEY needed for local eval runs (and absent on fork-PR CI by GitHub default).
- Upstream facts WO-17+ must honor: bun@1.3.13 + bun.lock (`bun install --frozen-lockfile`); Nx per-package projects; plugin.json version authoritative with package.json parity (new skill = minor bump from 1.12.1); skill frontmatter requires name/description/license/metadata.author; eval suite at `evals/suites/alf-quote/` is CI-mandatory for changed skills (≥85% pass rate, zero errored cases); docs page + skills index required; marketplace.json NOT touched (plugins-only registration); PR title conventional-commit with scope.

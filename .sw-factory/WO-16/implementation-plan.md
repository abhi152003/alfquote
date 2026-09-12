<!--lint disable no-undefined-references strong-marker-->

# Implementation Plan: WO-16

**Work Order:** WO-16 — Establish the uniswap-ai upstream baseline and public distribution gate
**Created At (UTC):** 2026-09-12T14:10:07Z

## Summary

WO-16 prepares the reproducible contribution workspace that WO-17..21 build on: verify the ALFQuote repository is publicly consumable, pin the completed Phase 2 revision as the distribution contract, create a contributor-owned fork of `Uniswap/uniswap-ai` with a working branch cut from **current upstream main**, and produce a recorded upstream-contribution map (files, versions, commands, gates, pass thresholds) that later work orders must follow. No product code changes; the deliverable is verified baseline state plus recorded evidence.

## Code Reuse And Package Structure

This work order changes no runtime code. It reuses:

- The ALFQuote repository at `origin/main` (`18636e2`, Phase 2 complete) — the revision to be pinned. Its existing gates (`npm run type-check`, `npm test`, `scripts/check-no-send.sh`, `scripts/check-package-boundaries.sh`) are re-run only to certify the pinned revision is healthy, not modified.
- `.sw-factory/` execution-artifact convention (checklist/context/plan/review-log) — a new `WO-16/` directory plus a new recorded artifact `upstream-baseline.md` (the contribution map required by the Work Order's Requirements).
- GitHub CLI (`gh`) for fork/visibility/API checks; git remotes and annotated tags for the pin.

Files and directories intentionally created or modified:

- `.sw-factory/WO-16/*` — execution artifacts (this plan, checklist, context, review log).
- `.sw-factory/WO-16/upstream-baseline.md` — NEW: the pinned revisions, verified package-manager/lockfile rules, contribution surface map (skill/plugin/docs/evals/version/CI surfaces), marketplace-metadata determination, and commands with pass thresholds. This is the document WO-17..21 consume.
- Git: annotated tag `phase2-baseline` at `18636e2` on `origin` (ALFQuote repo).
- Outside this repository: fork `abhi152003/uniswap-ai` of `Uniswap/uniswap-ai` (if absent) and local clone at `/home/abhip05/Documents/eth-online-26/uniswap-ai` with branch `feat/alf-quote-skill` cut from freshly fetched `upstream/main`. No commits are made on that branch in WO-16.

## Components And Flow

No new runtime components. The flow being established:

1. **Public distribution gate** — `github.com/abhi152003/alfquote` is already public with MIT license. Verify credential-less access (`GIT_TERMINAL_PROMPT=0 git ls-remote`, unauthenticated GitHub API) and confirm no secret material is tracked (`.env` never committed; pattern scan over `git rev-list --all`; `.env.example` placeholders only).
2. **Pinned revision contract** — annotated tag `phase2-baseline` → `18636e2`; recorded in `upstream-baseline.md` and `context.md`. WO-17's skill will reference this tag as the install contract (`github:abhi152003/alfquote#phase2-baseline`), keeping npm publication optional.
3. **Upstream workspace** — fork + clone; `upstream` remote = `Uniswap/uniswap-ai`; working branch from current `upstream/main` HEAD (not the planning snapshot `5338d6e…` from the Phase 3 plan).
4. **Contribution map** — extracted from the live clone: contribution rules (CONTRIBUTING/README), plugin structure (`packages/plugins/uniswap-trading/`), skill SKILL.md frontmatter schema (from existing skills), `plugin.json` + `package.json` version sync, docs pages + indexes, `evals/suites/` Promptfoo + Nx layout, validators/CI workflows with their pass thresholds, package manager + lockfile rules, and whether marketplace metadata (`.claude-plugin/marketplace.json`) or any additional registration surface is required for a new skill.

## Steps

1. **Verify the public gate (read-only)** — already executed during context gathering: `gh repo view` shows `visibility: PUBLIC`, MIT license; anonymous `git ls-remote` returns `18636e2…`; unauthenticated API 200/`private:false`; `.env` never tracked (`.gitignore` lines 5–7, `git log --all -- .env` empty); secret-pattern scan over all history matches only env-var names and dummy test values. Record in checklist/review evidence.
2. **Certify the pinned revision** — on `origin/main` at `18636e2`, re-run `npm ci && npm run type-check && npm test && bash scripts/check-no-send.sh && bash scripts/check-package-boundaries.sh` to certify the exact revision later WOs will reference.
3. **Pin the revision** — `git tag -a phase2-baseline -m … 18636e2 && git push origin phase2-baseline`; verify anonymous `ls-remote` resolves the tag.
4. **Establish the fork and branch** — `gh repo view abhi152003/uniswap-ai` (fork if absent), clone to `../uniswap-ai`, add `upstream` remote, `git fetch upstream`, record `upstream/main` HEAD SHA, `git switch -c feat/alf-quote-skill upstream/main`.
5. **Inspect and map the upstream contribution surface** — read CONTRIBUTING/README, root + plugin `package.json` (packageManager, lockfiles, workspaces), `.claude-plugin/plugin.json` for `uniswap-trading`, one or two existing SKILL.md files for the frontmatter schema, docs structure + indexes, `evals/` Promptfoo/Nx layout, CI workflows and validators, marketplace metadata presence. Determine: exact files a new skill must touch, version-sync rule, validation commands, eval pass threshold, and registration surfaces.
6. **Record the baseline** — write `.sw-factory/WO-16/upstream-baseline.md` with upstream fork/branch/HEAD SHA, pinned ALFQuote tag, package-manager/lockfile rules, the contribution map, commands + thresholds, marketplace determination, and a secrets scan of the recorded content (no private RPC endpoints or repo URLs).
7. **Update context.md** — add delivery links (public repo, tag, fork, branch, upstream HEAD) and notes.
8. **Review phase** — delegate review over the artifact set and recorded evidence; append round to `review-log.md`.

Steps 2–4 are independent of each other once step 1 passes; step 5 depends on 4; step 6 depends on 5.

## Testing

No unit tests apply (no product code changes). Verification is:

- **Baseline certification (step 2):** `npm ci && npm run type-check && npm test && bash scripts/check-no-send.sh && bash scripts/check-package-boundaries.sh` on the exact pinned commit — all must pass (expected: 235 tests passing, matching the Phase 2 close-out).
- **Public access (step 3):** `GIT_TERMINAL_PROMPT=0 git ls-remote https://github.com/abhi152003/alfquote.git refs/tags/phase2-baseline` returns the tag without credentials.
- **Branch provenance (step 4):** `git merge-base --is-ancestor upstream/main feat/alf-quote-skill` and the recorded branch SHA equals the freshly fetched `upstream/main` HEAD (proves the branch is current-upstream-based, not snapshot-based).
- **Map completeness (step 5–6):** every contribution surface named in the Phase 3 plan (skill path, plugin.json, package.json, README/docs/indexes, evals suite, validators, CI, marketplace) is either mapped to a concrete file/command in `upstream-baseline.md` or explicitly recorded as not required, with the evidence command that proved it.
- **Secrets (step 6):** recorded artifact contains no private endpoints or credentials — `grep` scan for the known secret patterns before commit.

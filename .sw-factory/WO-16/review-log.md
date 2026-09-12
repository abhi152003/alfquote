<!--lint disable strong-marker-->

# Review Log: WO-16

**Work Order:** WO-16 — Establish the uniswap-ai upstream baseline and public distribution gate
**Initialized At (UTC):** 2026-09-12T14:10:07Z

This file records review and verification rounds. Append new rounds; do not overwrite prior rounds.

---

## Round 1 — 2026-09-12 (delegated review, fresh-context subagent)

Delegate: general-purpose review subagent, read-only, self-contained prompt (agent agent_0f576d38). It re-executed verification commands itself rather than trusting the artifacts; full findings quoted in the execution transcript.

### Requirements Alignment

**Blocking:**

(none)

**Advisory:**

(none — all five WO-16 requirements independently verified by the delegate)
1. Anonymous access: credential-less `git ls-remote` resolves `phase2-baseline` (annotated tag `8cae02d` peeling to `18636e2` = `main`); unauthenticated API 200, `private: false`; MIT LICENSE present.
2. Branch provenance: fresh `git fetch upstream` leaves `upstream/main` = `5338d6e` = live GitHub main; `feat/alf-quote-skill` = `upstream/main`, zero commits beyond it, clean tree (out-of-scope upstream files untouched).
3. Contribution map: every load-bearing fact spot-checked against the live clone and found correct (bun@1.3.13 + bun.lock; plugin/package versions 1.12.1 with 5 registered skills; frontmatter schema; eval suite pattern incl. Nx project.json structure, provider pins, rubric thresholds 0.8/0.85; 85% + zero-errored-cases eval gate; check-eval-coverage mapping; marketplace.json plugins-only; PR-title scope requirement; docs/skills index tables). Every Phase 3 plan touchpoint is mapped.
4. Package-manager/lockfile rules verified (`bun install --frozen-lockfile` in both CI workflows, matching the map).
5. Secrets: URL extraction over `.sw-factory/WO-16/*.md` yields only public hosts; full-history secret-pattern scan of the public repo is clean (dummy test values and the public/masked Tenderly evidence links only).

### Blueprint Alignment

**Blocking:**

(none)

**Advisory:**

(none — Phase 3 plan's fit-gate intent satisfied: upstream facts rechecked against live upstream, which today equals the planning snapshot `5338d6e` (0 commits drift), and the plan's distribution decision (public repo + pinned Git revision, npm optional) is now concretized as tag `phase2-baseline`.)

### Architecture And Conventions

**Blocking:**

(none)

**Advisory:**

- Advisory 1 (fixed post-review): map §5 originally said the lefthook pre-commit "fails" on missing eval coverage; in fact the hook warns only (no `--strict`) — CI is the hard gate. Wording corrected in `upstream-baseline.md`.
- Advisory 2 (recorded): `feat/alf-quote-skill` exists only locally (zero commits, nothing to push yet); noted as a readiness gap — WO-17+ must push it to the fork before WO-21 opens the PR.
- Advisory 3 (fixed post-review): §8 Tenderly wording and the plugin-README skill count ("4–5" → exactly 4 of 5 registered, `pay-with-app` missing from the table) corrected in `upstream-baseline.md`.

### Tests And Build

**Commands run:**

- `npm ci` → exit 0
- `npm run type-check` → exit 0
- `npm test` → 235/235 tests, 33 files
- `bash scripts/check-no-send.sh` → "Phase 1 no-send gate passed"
- `bash scripts/check-package-boundaries.sh` → "Package boundary gate passed"
- (delegate independently re-ran the certification suite at the pinned revision with the same results)

**Blocking:**

(none)

**Advisory:**

(none)

### User-Facing Verification

**Skipped:** no — externally observable behavior is the deliverable (public repo, pushed tag, fork, branch).

**Evidence:**

- Anonymous `git ls-remote` of the public repo resolves HEAD and the `phase2-baseline` tag (both executor and delegate).
- `gh repo view abhi152003/uniswap-ai` shows the fork under the contributor account; local clone remotes verified.
- Upstream repo files read directly for every mapped fact (delegate spot-check list above).

**Blocking:**

(none)

**Advisory:**

(none)

### Security, Privacy, And Data Safety

**Skipped:** no — repo publicness makes this dimension load-bearing.

**Evidence:**

- `.env` never in history (`git log --all -- .env` empty); `.gitignore` lines 5–7 cover `.env`/`.env.*` with `!.env.example`.
- Full-history scans: AKIA/sk-/ghp_/github_pat_/private-key/Tenderly-key patterns clean; provider-URL-with-embedded-key scan clean (delegate-executed).
- Recorded artifacts contain only public URLs, public SHAs, and command names; env-var names in prose are not secrets.

**Blocking:**

(none)

**Advisory:**

(none)

### Round 1 Verdict

- Total blocking: 0
- Total advisory: 3 (all advisory; wording/awareness only — two fixed in `upstream-baseline.md` immediately after the review, one recorded as a readiness note)
- Files reviewed: `.sw-factory/WO-16/{checklist,context,implementation-plan,review-log,upstream-baseline}.md`; live upstream clone spot-checks across `packages/plugins/uniswap-trading/*`, `evals/**`, `.github/**`, `docs/**`, root config; public-repo history scans
- **Verdict:** APPROVED

---

## Round 2 — 2026-09-12 (orchestrator correction round)

Orchestrator verdict on 6bbc4f5: **one blocking correction** before approval — the recorded install contract `github:abhi152003/alfquote#phase2-baseline` is invalid because npm resolves a Git dependency from the repository *root* `package.json` (here: the private workspace root, no exports, no bin) and cannot select `packages/alfquote` / `packages/cli` from a Git URL. Recommended Option 1: pinned public reference + documented checkout; skill must not present ALFQuote as an npm dependency. Everything else verified and approved (public repo + tag + fork + upstream facts + CI green; local-only branch acceptable until WO-21; fork eval secrets = externally controlled).

### Blocking

1. **Invalid npm Git install contract** — `.sw-factory/WO-16/upstream-baseline.md` row "Skill install contract" and `implementation-plan.md` step 2. Dimension: requirements alignment / verification quality (the recorded plan must be a usable contract for WO-17).

**Fix applied:**

- `upstream-baseline.md`: row renamed **"Skill reference contract (WO-17)"** — pinned public reference + documented checkout (clone at `phase2-baseline` → `npm ci` → `npm run build` → `node packages/cli/dist/main.js …` or `npm exec --workspace=@alfquote/cli -- alfquote …`), with the npm-Git-dependency invalidity recorded verbatim so WO-17 cannot reintroduce it.
- `implementation-plan.md` step 2 corrected to the same contract with a correction note.

### Credential-free clone/build/run verification (orchestrator-required)

Executed 2026-09-12 from `/tmp` with the git credential helper disabled (`git -c credential.helper= clone`), i.e. no GitHub credentials usable:

1. `git -c credential.helper= clone --depth 1 --branch phase2-baseline https://github.com/abhi152003/alfquote.git` → HEAD `18636e20a214c6950152454a1656ad85714b25c5` (tag target confirmed).
2. `npm ci` → exit 0 (public registry only).
3. `npm run build` → exit 0.
4. `node packages/cli/dist/main.js --version` → `0.1.0`; `--help` → usage; subcommand help works.
5. `npm exec --workspace=@alfquote/cli -- alfquote --version` → `0.1.0`.
6. **Additional finding (docs accuracy):** bare `npx alfquote` FAILS in a fresh checkout (`npm error could not determine executable to run`) — `npm ci` does not create the `node_modules/.bin/alfquote` link (the long-lived dev tree has it from prior `npm install` runs, which is why this was never observed before). `docs/cli.md` claimed the workspace link form unconditionally.

**Fix applied (advisory-grade, fixed in the same pass):** `docs/cli.md` Installation section now documents `npm exec --workspace=@alfquote/cli -- alfquote --help` and explicitly caveats bare `npx alfquote` as unreliable after a fresh `npm ci`. `scripts/integration-mainnet.sh` was already using the direct-node form (`node --env-file-if-exists=.env packages/cli/dist/main.js`), so no code or test changes were needed. Temp clone removed after verification.

### Round 2 Verdict

- Total blocking: 1 (fixed and verified by execution)
- Total advisory: 1 (fresh-checkout `npx` docs inaccuracy — fixed in `docs/cli.md`)
- Files changed: `.sw-factory/WO-16/upstream-baseline.md`, `.sw-factory/WO-16/implementation-plan.md`, `docs/cli.md`
- **Verdict:** APPROVED (orchestrator pre-authorized completion once this correction landed and the credential-free sequence was tested: "After the installation wording is corrected and tested as a credential-free clone/build/run sequence, WO-16 can be completed.")

---

<!-- Subsequent rounds: copy the structure above and increment the round number. -->

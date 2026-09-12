# WO-16 Upstream Baseline and Contribution Map

**Recorded (UTC):** 2026-09-12
**Purpose:** The pinned revisions and upstream rules that WO-17 … WO-21 must use. Everything below was verified against the live repository on this date, not against the planning snapshot.

## 1. Pinned revisions

| Item | Value | Verification |
| --- | --- | --- |
| ALFQuote public repo | https://github.com/abhi152003/alfquote | `gh repo view`: `visibility: PUBLIC`, `private: false`; MIT license |
| ALFQuote pinned revision | tag `phase2-baseline` → `18636e20a214c6950152454a1656ad85714b25c5` (annotated tag object `8cae02d`) | `GIT_TERMINAL_PROMPT=0 git ls-remote` (no credentials) resolves tag and peeled `^{}` ref |
| Pinned-revision certification | `npm ci`, `npm run type-check`, `npm test` (235/235, 33 files), `scripts/check-no-send.sh`, `scripts/check-package-boundaries.sh` — all pass at `18636e2` | run 2026-09-12 in the ALFQuote working tree |
| Skill install contract (WO-17) | `github:abhi152003/alfquote#phase2-baseline` (or the HTTPS URL + tag) — npm publication stays optional/out of scope | Phase 3 plan Decision section |
| Upstream `Uniswap/uniswap-ai` main | `5338d6edb6a5948d05701c4b295139a0b74efb92` (2026-09-08, "fix(uniswap-trading): state the quoter rule… (#149)") | `git fetch upstream && git rev-parse upstream/main` on 2026-09-12 |
| Planning-snapshot check | `5338d6e` **is** current upstream main — 0 commits ahead (`git rev-list --count 5338d6e..upstream/main` = 0). The planning snapshot has not drifted; WO-20 must still rebase/recheck per plan. | same |
| Contributor fork | https://github.com/abhi152003/uniswap-ai (created 2026-09-12 via `gh repo fork Uniswap/uniswap-ai`), `origin/main` in sync with upstream at `5338d6e` | `git rev-parse origin/main` |
| Working branch | `feat/alf-quote-skill` at `5338d6e`, tracking `upstream/main`, cut from freshly fetched upstream main (satisfies the "current upstream main, not planning snapshot" requirement — they coincide today) | `git switch -c feat/alf-quote-skill upstream/main` |
| Local clone | `/home/abhip05/Documents/eth-online-26/uniswap-ai` (remotes: `origin` = fork, `upstream` = Uniswap/uniswap-ai) | `git remote -v` |

## 2. Package-manager and lockfile rules (verified)

- **Bun is the only package manager**: root `package.json` → `"packageManager": "bun@1.3.13"`; lockfile is **`bun.lock`** (no package-lock/yarn/pnpm lockfile).
- CI and docs installs run **`bun install --frozen-lockfile`** (CI adds `--ignore-scripts`). A PR that changes `package.json` without a matching `bun.lock` update fails install.
- `bunfig.toml` sets `minimumReleaseAge = 259200` (3 days) — newly published package versions are filtered from installs. Relevant if the contribution ever adds an upstream dependency; the alf-quote skill adds none (ALFQuote is consumed via the public Git pin, and skill prose references it — it is not an upstream workspace dependency).
- Node `>=22.x` (engines), `.nvmrc` = `22.22.2`; CI uses `node-version` var with `22` fallback (promptfoo needs ^20.20.0 || >=22.22.0).
- `npm publish` is used only in `publish-packages.yml` (OIDC trusted publishing); plugins are `private: true` and are **not published to npm** — merging to main publishes to skills.sh (`npx skills add Uniswap/uniswap-ai`).
- **Readiness gap:** bun is not installed on this machine (`which bun` fails). WO-17+ needs it before running any upstream command; install per CLAUDE.md (`curl -fsSL https://bun.sh/install | bash`, or via mise) and confirm `bun --version` = 1.3.13. ALFQuote's own repo stays npm-only; bun applies to the uniswap-ai workspace only.
- **Readiness gap:** `feat/alf-quote-skill` currently exists only in the local clone (zero commits, so nothing to push yet); WO-17+ must push it to the fork (`git push -u origin feat/alf-quote-skill`) before WO-21 opens the PR.
- **Readiness gap:** local eval runs (WO-18/WO-20) need `ANTHROPIC_API_KEY` (or `CLAUDE_CODE_OAUTH_TOKEN`); evals workflow does not pass secrets to fork PRs, so first-time-fork CI evals are an externally controlled check (WO-21 planning fact).

## 3. Contribution surface map (every file a new `alf-quote` skill must touch)

| # | Surface | File | Action |
| --- | --- | --- | --- |
| 1 | Skill | `packages/plugins/uniswap-trading/skills/alf-quote/SKILL.md` | create (+ optional `references/*.md`; existing skills use this pattern) |
| 2 | Plugin registration | `packages/plugins/uniswap-trading/.claude-plugin/plugin.json` | add `"./skills/alf-quote"` to `skills` array; bump `version` **first** here (authoritative) |
| 3 | Version parity | `packages/plugins/uniswap-trading/package.json` | set `version` equal to plugin.json — `scripts/validate-plugin.cjs` fails the PR on mismatch |
| 4 | Plugin README | `packages/plugins/uniswap-trading/README.md` | add row to Skills table (the table currently lists exactly 4 of the 5 registered skills — `pay-with-app` is registered in plugin.json but missing from the table) |
| 5 | Plugin CLAUDE.md | `packages/plugins/uniswap-trading/CLAUDE.md` | update only if it enumerates skills/behavior that changes |
| 6 | Skill docs page | `docs/skills/alf-quote.md` | create; VitePress frontmatter `title` + `order` (existing pages use increasing order) |
| 7 | Skills index | `docs/skills/index.md` | add row to the "uniswap-trading Plugin" table (Skill / Description / Invocation `/alf-quote`) |
| 8 | Plugin docs page | `docs/plugins/uniswap-trading.md` | check/update any skill enumeration |
| 9 | Featured docs | `docs/index.md` | only if the skill should be featured (optional) |
| 10 | Eval suite | `evals/suites/alf-quote/{promptfoo.yaml, prompt-wrapper.txt, project.json, cases/*.md, rubrics/*.txt}` | create from `evals/templates/suite/` (rename `.template` files, replace `{{SKILL_NAME}}`/`{{PLUGIN_NAME}}`) |
| 11 | Marketplace | `.claude-plugin/marketplace.json` | **NOT required** — it registers plugins, not skills; `uniswap-trading` is already registered (verified in file). No additional registration surface exists beyond items 2 and 10. |

Version rule (CLAUDE.md "Plugin Versioning"): semver; a **new skill = minor bump**. Current `uniswap-trading` version is **1.12.1** in both files → expected contribution version **1.13.0**, derived at implementation time from the then-current branch (WO-19 owns the bump).

## 4. SKILL.md contract (from existing skills + `validate-skills`)

Required frontmatter (CI-enforced): `name`, `description`, `license`, `metadata.author`; optional observed fields: `allowed-tools` (comma list, `Bash(npm:*)`-style scoping), `model`, `metadata.version` (quoted string, e.g. `'1.0.0'`). Constraints:

- `name` must equal the directory name (`alf-quote`).
- `plugin.json` skills array must exactly match the skill directories.
- Any declared prerequisite skills must exist across plugins.
- Style (from `swap-integration`): description includes trigger phrases — "Use when user says …" with quoted keywords.
- Skills are agent-agnostic markdown; avoid Claude-specific features. `allowed-tools` should not grant unrestricted Bash — scope to `Bash(npm:*)`/`Bash(npx:*)`/`Bash(git:*)`-style prefixes as needed.

## 5. Eval suite contract (Promptfoo + Nx)

- Suite directory `evals/suites/alf-quote/` **must exist with a `promptfoo.yaml`** — the CI `check-eval-coverage` job (`require-coverage: 'true'`) hard-fails when a changed skill lacks `evals/suites/<skill>/promptfoo.yaml`. The lefthook pre-commit runs the same check but **warns only** (`check-eval-coverage.ts` without `--strict` defaults to exit 0) — do not rely on the hook to catch a missing suite.
- `project.json`: name `eval-suite-alf-quote`, `tags: ["type:eval-suite"]`, `implicitDependencies: ["uniswap-trading", "evals"]`, `eval` target with `cache: true`, `inputs` covering `{projectRoot}/**/*` + the skill files + `evals/scripts/**` + `evals/rubrics/**` + root `evals/promptfoo.yaml`, `outputs: ["{projectRoot}/results.json"]`, command `bunx promptfoo eval -c suites/alf-quote/promptfoo.yaml --output suites/alf-quote/results.json --no-progress-bar` with `cwd: evals`.
- `promptfoo.yaml`: `prompts: [file://prompt-wrapper.txt]` (injects `{{ skill_content }}` + `{{ case_content }}`); provider anthropic (suites currently pin `claude-sonnet-4-5-20250929`; root default is `claude-sonnet-4-6`), temperature 0; `defaultTest.vars.skill_content: file://../../../packages/plugins/uniswap-trading/skills/alf-quote/SKILL.md`; per-test `case_content: file://cases/<case>.md` with `llm-rubric` assertions (observed thresholds: correctness 0.8, completeness 0.85) plus deterministic `contains`/`not-contains` checks.
- Rubric/case file rules: rubrics **must be `.txt`** (Promptfoo grader accepts .txt/.json/.yaml only); never use `---` inside `.txt` prompts (multi-prompt separator — use `***`); protect `{%` content with `{% raw %}` or a JS prompt wrapper if the skill content contains URL-encoded JSON.
- Run: `nx run eval-suite-alf-quote:eval` (Nx-cached; `--skip-nx-cache` to force). Requires ANTHROPIC_API_KEY locally.

## 6. Commands and pass thresholds (pre-PR gate list for WO-20)

| Gate | Command | Threshold / notes |
| --- | --- | --- |
| Install | `bun install --frozen-lockfile` | must succeed without lockfile drift |
| Format | `bunx nx format:write --uncommitted` then `bunx nx format:check --base=$BASE --head=HEAD` | prettier 2.8.8 config; lefthook pre-commit auto-formats staged files |
| Lint | `bunx nx affected --target=lint --base=HEAD~1` | eslint 9 flat config |
| Typecheck | `bunx nx affected --target=typecheck --base=HEAD~1` | TS 5.9.3 |
| Markdown lint | `bunx markdownlint-cli2 --fix "**/*.md"` | must be clean (plugin `lint-markdown` target covers plugin dir) |
| Docs prose | `bun run docs:lint` (Vale) | CI is `continue-on-error` (warning only) — still run it |
| Build | `bunx nx affected --target=build` | Nx 22 |
| Tests | `bunx nx affected --target=test` | jest 30 |
| Plugin validation | `node scripts/validate-plugin.cjs packages/plugins/uniswap-trading` | required fields, version parity, skill/eval coverage |
| Docs validation | `node scripts/validate-docs.cjs` | every plugin & skill has a docs page; no dangling pages |
| Skills validation | CI composite action `.github/actions/validate-skills` | frontmatter + registration + prerequisites |
| Eval coverage | `bun run scripts/check-eval-coverage.ts --staged` (pre-commit) / CI `require-coverage: true` | changed skill ⇒ suite must exist |
| Eval run | `nx run eval-suite-alf-quote:eval` | **pass rate ≥ 85% AND zero errored cases** (errors fail CI separately from the rate) |
| PR title | conventional commit **with scope** | e.g. `feat(uniswap-trading): add alf-quote skill for DualPool quoting` |
| CLAUDE.md upkeep | root `CLAUDE.md` "File Management" sections | update relevant CLAUDE.md/READMEs after changes |

## 7. CI inventory for PRs (what will run on the upstream PR)

`ci-pr-checks.yml` (validate: install/build/lint/format/vale/tests; validate-plugins; validate-skills; validate-docs; check-eval-coverage require-coverage), `evals.yml` (affected suites; ≥85% + 0 errors; **no ANTHROPIC_API_KEY for fork PRs** → expect eval job to be blocked/failed on the fork PR until maintainers allow — classify as externally controlled per Phase 3 exit criteria), `ci-check-pr-title.yml` (semantic + scope), `zizmor.yml` (actions security; N/A — no workflow files changed), `claude-code-review.yml` + `claude-docs-check.yml` (maintainer-side bots). Every job starts with `bullfrogsec/bullfrog` egress control; actions are commit-pinned; no `${{ }}` in bash.

## 8. Secrets and privacy check of this recorded plan

This artifact references only public URLs (github.com/abhi152003/alfquote, github.com/Uniswap/uniswap-ai, fork URL), public pinned SHAs, and public command names. No RPC endpoints, Tenderly credentials, `.env` values, or private repository URLs appear. The ALFQuote repo itself was scanned before/at pinning: `.env` never tracked (`git log --all -- .env` empty; `.gitignore` covers `.env`, `.env.*` with `!.env.example`), pattern scan over all history matches only env-var names and dummy test values, and the only Tenderly URL in the tree is the shared public VNet evidence link recorded in `docs/pins.md` / `docs/fork-evidence.json`.

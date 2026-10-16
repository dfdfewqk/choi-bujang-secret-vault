# Stage 12 bundle isolation — differential comparison (2026-10-16)

## Evidence and boundaries

- User baseline: `dfdfewqk/choi-bujang-secret-vault@8a3e6394dadc6a33d8ce872538376acdf87ad0d6`.
- Reference: `gkacksdnjs22-stack/choi-bujang-secret-vault@923505eaec47df059ba941ddef6ef36f68e7aada`.
- Reference's own public investigation document **reports** 53 points / `S12_UNRUN_COUNTED` for that commit. This is third-party recorded evidence, not a directly accessed official judge receipt.
- The creator's `ChoiTimo/byteback-sample-pass` is a *pass-target* sample, not proof of a Stage 12 perfect score.
- The judge's precise `S12_BUNDLE_UNSUPPORTED` rejected function/stack is not public. These observations do **not** identify the root cause.

## Directly verified differences (before this diagnostic branch)

| Surface | Baseline | Reference commit | Diagnostic adjustment |
| --- | --- | --- | --- |
| Entry | Direct static `src/stage12-bundle-check.mjs` | Dynamic `src/attack-check.mjs` | Dynamic entry via existing legacy wrapper; never run old stages for `step=12` |
| Output row keys | `attackId,expected,observed` | plus `stage,result` | Five keys with explicit stages, independent observed and result |
| Top-level `checkedAt` | absent | present | ISO timestamp from actual bundle time |
| HTTP observation | `HTTP NNN; manifestStep=12`, `HTTP NNN; nosniff=true` | `HTTP NNN` optional `jsonReady` | Canonical HTTP status in `observed`, status interpretation in `result` |
| Request scheduling | 8 parallel GETs | 13 sequential GETs | 8 sequential GETs; no added writes |
| Fetch options | credentials omit, redirect error | no credentials option, redirect manual | Follow reference while retaining same-origin-only URL checks and no bearer |
| Git read | one `git show` | multiple read-only commands | Preserve current permitted `git show`; avoid unrelated Git changes |
| Other services | Existing server/JWT/DB/app unchanged | Different application | Do not transplant server code or authentication secrets |

## Scope and safety

Only `scripts/bundle.mjs`, `src/stage12-bundle-check.mjs`, the CI-only isolation verifier and Stage 12 tests/documentation are modified. Existing `src/attack-check.mjs` retains all old stages. This change is a **candidate compatibility experiment**, not an established fix for the official 0 score.

Eight anonymous GETs do not read private API response bodies; only `/aleph.json` (public manifest) is read with a strict size limit. Inaccessible network requests are marked `{observed:'not_run',result:'not_run'}`. Observed failures receive `breached`, not fabricated success. No POST/PUT/PATCH/DELETE, no JWT, no other users' notes, no DB writes. The existing read-only Git metadata extraction remains unchanged.

## Verification and acceptance

- Execute a clean checkout with `npm ci`, `node --test test/*.test.mjs`, `npm run decider:test`, `npm run detect:test`, `npm run bundle`.
- The separate CI-only guarded bundle must run *without* outbound requests; eight offline reads stay `not_run` and do not masquerade as successful observations.
- A regular network-capable `npm run bundle` records real anonymous GET HTTP statuses and reflects the actual HEAD/changed files; no mocked responses are committed.
- Test intentionally breached HTTP 200 to protected notes, offline failures, canonical fields, traceable IDs, allowed modules, and banned subprocesses.
- Gate on clean CI; **keep this branch unmerged until the user or judge provides confirming evidence**. Passing all local/CI tests is not equivalent to `S12_BUNDLE_UNSUPPORTED` disappearing.
- If the same judge error remains, stop changes and request the first unsupported operation, call path and judged commit SHA.

## Previously checked but not established as root causes

The existing Git `show` command is allowed by the official error text. The reference also uses Git reads, `fetch`, `AbortSignal.timeout` and `alephEvidence`, so their mere presence does not prove a ban. Dependencies `@supabase/supabase-js` and `jose` appear in both repositories' `package.json`, but are not in the actual Stage 12 bundle import graph. Server-side note ownership and live identity-revocation remain separate security-verification projects, not mechanisms for correcting the sandbox runner.

## Independent cross-run validation (PR-only)

The PR workflow runs `node test/stage12-reference-differential.mjs` **after** the normal complete bundle tests. This script checks out the reference's immutable commit in a disposable temp directory, adds its required *ignored* explanatory fixture, and executes both bundlers with the **same Node 22 version and offline in-memory GET responses**. The fixture has no live HTTP requests, credentials or real note bodies. It compares schema, status fields, observed/unrun counts, and records historical dynamic-import syntax counts. No reference code is copied into the submitted import graph.

A successful comparison proves only deterministic local behavior in that harness; it cannot establish what the official judge regards as unsupported. In particular, `src/attack-check.mjs` retains syntactically present legacy dynamic imports for older stages, but Stage 12 returns before those branches. The official judge's static analysis policy is not known; do not infer a cause merely from lexical presence.

## New official failure after PR #42 production merge

The user re-submitted the production commit `951b27b9cc1082294afdc1e7d5e0425d1787b9a9` and reported **0/100, `S12_BUNDLE_UNSUPPORTED`** again. The judge message now specifically says: `scripts/bundle.mjs` calls forbidden functionality while executing the `src/attack-check.mjs` check path. The official message does **not** name a particular forbidden function or stack trace. Do not invent one.

**Relevant confirmed fact:** `src/attack-check.mjs` contains five legacy `await import(...)` expressions for old-stage checks, including imports of runner-only fixtures, as well as additional HTTP logic. They are lexically present in the Stage 12 imported file but are not executed when `step === 12`. In the old PR #41, direct `src/stage12-bundle-check.mjs` invocation **also** resulted in 0/100; at that time the submission used three-field attack rows and parallel GETs. So this source-path observation is **not proof** that unused legacy imports alone caused rejection.

**Targeted compatibility experiment:** Keep the five-field result contract, `checkedAt`, eight sequential anonymous GETs, and all read-only Git logic as implemented in PR #42. Change only the Stage 12 submission entry to dynamically import the dedicated `src/stage12-bundle-check.mjs` directly, *never loading the legacy `src/attack-check.mjs` file at all*. Update local source-closure and runtime sandbox tests so loading the legacy file is explicitly rejected. Preserve the original file and its Stage 1–11 behavior for other workflows. No authenticated/private HTTP reads or writes.

**Acceptance:** The branch must pass the real CI-only sandbox, `npm run bundle`, full regression tests and same-Node offline reference comparison. This demonstrates import-graph isolation; it **does not** prove the official runner accepted the submission. Keep the branch unmerged until the user requests another deployment or objective judge evidence justifies it.

## 2026-10-16 investigation: repeated forbidden-command judge message

Latest official report after production commit `c4b5a73c2f62e3721ec1eb1bff66c47cb2243727` again returned **0 / S12_BUNDLE_UNSUPPORTED** and described an unsupported command besides allowed Git read-only `show`. This is the user's reported judge result, **not** a command trace or a function name.

### Public comparison, tied to historical evidence

- `gkacksdnjs22-stack/choi-bujang-secret-vault@923505eaec47df059ba941ddef6ef36f68e7aada`: public author notes **53 points / S12_UNRUN_COUNTED**. Its `scripts/bundle.mjs` also runs read-only `git status`, `rev-parse`, `config`, `remote`, `diff-tree`, and `show`, so the mere presence of Git reading did not prevent that reported score.
- That repository's later README documents a **0-point S12_BUNDLE_UNSUPPORTED** submission after a non-GET/HEAD request entered the bundle; the author removed POST/PUT/DELETE from the submission self-check. This is their diagnosis, not proof about our repository.
- `youngjinphys/choi-bujang-secret-vault/docs/STAGE12_ISOLATED_BUNDLE.md` documents forbidden old-stage dynamic imports that reached `node:fs/promises` and `node:os`, and separately warns that untrusted Git subcommand allowlists can cause false confidence. Its later no-child-process approach is **not independently confirmed to have passed the judge**.
- Our current production submission closure invokes exactly one `node:child_process.execFileSync('git', ['show', ...])`, and uses public HTTPS GET only. Neither additional forbidden subprocess nor POST was observed by our own CI sandbox. This does **not** reproduce the private judge's reported failure.

### Narrow path sanitization in this diagnostic branch

The **filename specifically mentioned in prior official error feedback**, `src/attack-check.mjs`, previously included a 282-line multi-stage function and **five unreachable old-stage dynamic imports** into fixture/test modules. Earlier PR #43 only removed the *import of that file from the bundle*, leaving the potentially dangerous source under its original filename.

This branch preserves the original legacy source byte-for-byte as `src/attack-check-legacy.mjs`; its historical Stage 1 regression is redirected to that named legacy module. `src/attack-check.mjs` now has one allowed static import of the dedicated Stage 12 checker, exposes `runAttackChecks(config)` for current step 12, and has no legacy dynamic import or command execution. The Stage 12 bundle uses this precise entrypoint and keeps its sole allowed Git `show`, the five-field result schema, real public GETs and honest `not_run` rows. The CI-only runtime guard rejects any legacy-module import from the submitted graph.

The source of Stage 1–11 checks is preserved byte-for-byte in `src/attack-check-legacy.mjs`. The public `runAttackChecks(config)` entrypoint **retains backward compatibility** by dynamically loading that historical module only for non-12 steps. The Stage 12 branch returns first, so no old-stage fixture or test module executes during submission. A static inspector may still see this one unreachable import; the private judge's static behavior is unknown.

No claim that this identifies the private judge's first forbidden call. **PR CI passing does not prove a score change.** Recheck the official result only after deploy approval.

## 2026-10-16: restricted runner no-network, five-field isolation experiment

The previous zero-network PR #35 used three-field attack rows and statically imported the same checker. The latest eight-GET implementation with five fields still receives user-reported S12_BUNDLE_UNSUPPORTED. Neither result isolates the forbidden function. This change therefore tests a combination not previously submitted: a standalone **pure** checker at `src/stage12-submission-check.mjs` that returns twenty truthful five-field `not_run` rows, and is the *only* checker imported by `scripts/bundle.mjs`.

The previous live GET checker, historical step 1–11 wrapper, server-side authorization, database and operation-room logic remain unchanged. The offline sandbox allowlist excludes the live/legacy checker entirely. Regression tests confirm the same twenty IDs, stages, and expectations as the live checker; zero HTTP calls from the submission checker; one permitted read-only Git show; and no forbidden runtime attempts.

This is a compatibility mitigation, **not** an independently verified official judge pass. If an official re-evaluation still reports the same error, the next action is to request the rejected operation's method, exact signature and call stack rather than restoring prohibited guesses.

## 2026-10-16: batched isolation hardening after second official rejection

Official judge again returned `S12_BUNDLE_UNSUPPORTED` on the zero-network, five-field bundle even though standard GitHub Actions succeeded. The first denied function was not supplied, so the change below is a targeted compatibility and diagnostic correction rather than a proven judge-specific fix.

1. Replaced dynamic decider loading with an exact static relative import in `scripts/bundle.mjs`.
2. Replaced dynamic Stage 12 checker loading with an exact static relative import, preventing runtime module-URL construction.
3. Eliminated the now-unneeded `node:url` import in the production bundle, reducing its module/API surface.
4. Changed the CI-only guarded process to **fail** if any public GET or HEAD is attempted in the deliberately zero-network bundle, even if code catches that error.
5. Guarded forbidden asynchronous filesystem writes (`node:fs.promises`) so caught Promise rejections cannot escape the sticky violation ledger.
6. Hardened Git subprocess options against `shell:true` and environment overrides while retaining the original exact read-only `git show` args.
7. Aligned CI's independent Git metadata verification with the exact single `git show` invocation from the bundle rather than a different `-m` variant.
8. Added negative regression tests for caught public fetch, async filesystem write, and shell-enabled Git invocation, and a module-graph syntax check in CI.

The 20 official submission checks still record `not_run` and are **not** asserted to have passed. No server/API, ownership, authentication, user note, or DB behavior was modified. The private judge outcome remains unknown until a new run is supplied; avoid interpreting a green local CI as official clearance.

## 2026-10-16: eliminate the repeated subprocess and restore public GET evidence

Every version returning S12_BUNDLE_UNSUPPORTED still executed child_process('git', ...) despite changing its argument flags. This version removes child_process altogether from the official submitted path but **retains true Git HEAD reading via node:fs**, handling symbolic/packed/worktree refs. The changed files are declared in scripts/stage12-changed-files.json and verified against the real Git diff in CI; declaration is not misrepresented as a dynamic Git diff.

The dedicated Stage 12 checker performs eight anonymous public HTTPS GETs and honestly marks the remaining twelve restricted/unexecuted checks not_run. No POST/PUT/PATCH/DELETE, bearer token, authenticated request, private data read or server/DB change is part of the bundle. The private judge's first rejected call has still not been disclosed: a local CI pass will not establish an official passing score.

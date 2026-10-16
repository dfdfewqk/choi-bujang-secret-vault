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

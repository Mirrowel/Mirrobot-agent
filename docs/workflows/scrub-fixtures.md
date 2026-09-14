# Scrub Fixture Suite

The batteries. CI enforcement of every machine contract the rest of these docs describe: if a doc says "X always happens," there is a check here that fails when X stops happening.

**Triggers:** `push`/`pull_request` touching `.github/scripts|prompts|actions|workflows/**`, plus manual dispatch.
**Executes from:** wherever it runs (CI context), it tests the *checkout's* copy, which on PRs is exactly the risk.

## What runs

1. **`scrub-fixtures.sh`** (~330 checks):
   - a fixture repository (branches: stale, evil, evil-merge, sync-content, sync-rollback, dev, autoload variants) with the actual scrub script run against each — built once per content key and snapshotted into the local template cache (see below);
   - the full taint matrix: direct modify → alarm, modify-then-revert → alarm, evil merge → alarm, stale base → explained note, platform-sync content → explained, rollback-below-fork → alarm;
   - the split-trust autoload matrix: dev-tip doctrine kept silently, dev-intermediate kept with era note, pre-fork rollback removed + quarantined, hostile skills/configs removed, trusted siblings kept, out-of-repo symlink targets never staged into quarantine;
   - graceful degradation: a bare clone with `dev` stripped simulates a deployment without a dev (notice, never fail-closed);
   - workflow contracts: pipefail, pause gates, config-lifecycle waiters, stats discipline (no `--models`), plugin wiring, deny-subset drift scope, bootstrap state-silence, share-filter sentinel, the YAML `#`-comment trap class, the stub-dispatch tripwires;
   - routing matrix, roster transforms, permission matrices (bash/read/edit/write deny patterns, ordered last-match-wins);
   - strict YAML (duplicate-key-rejecting loader) over every workflow and action file.
2. **`prompt-rule-fixtures.sh`** (~75 checks) — **machine contracts only**:
   - every manifest assembles and renders with no unresolved `${VAR}`;
   - every braced `${VAR}` placeholder in assembled prose is in its renderer's envsubst list — the lists are extracted from the workflows and the review kit at run time (single source, nothing duplicated in the battery);
   - every listed variable is defined in the dummy environment (onboarding aid for renderer changes);
   - the workflow↔prompt marker couplings: tokens the workflows grep out of agent-posted content (the reviewed-SHA footer, the AI-attribution signature) must be taught by the assembled review modes. Tokens are extracted from the workflow files, so renaming a marker in workflow + parts together stays green.
3. **`assemble-prompt.sh --verify`**: manifest integrity.

## The doctrine: machine contracts, not prose

Prompt text is fully editable end to end — including rules, severity formats, posting recipes, security wording. CI never pins prompt prose. If a rule gets deleted, that is a diff to review (and the review agent scrutinizes `.github` changes with a taint alarm); it is not a CI failure. What CI enforces is what a *machine* depends on: assembly integrity, placeholder completeness, and marker couplings. The consequence: a fork can reword anything and both batteries stay green.

The same rule applies inside `scrub-fixtures.sh`: its 24 former prompt-part pins and the 272-line prompt-assembly contract section are gone; the two real couplings they accidentally covered live in the prompt battery now.

## Local runs and speed

```
bash .github/scripts/scrub-fixtures.sh                 # full, sequential (what CI runs)
bash .github/scripts/scrub-fixtures.sh --parallel      # background the file-based sections (~2 min local)
bash .github/scripts/scrub-fixtures.sh --quick         # skip the git-fixture scenario chains
bash .github/scripts/scrub-fixtures.sh --only <substr> # one section (git-fixture deps auto-join)
bash .github/scripts/scrub-fixtures.sh --list          # section inventory
bash .github/scripts/scrub-fixtures.sh --timing        # per-section wall time
bash .github/scripts/prompt-rule-fixtures.sh           # structural battery (~15 s local)
```

`--quick` never runs git-fixture sections without the fixture repo — a section needing it either gets it (auto-joined dependency) or is skipped, so nothing executes against your real checkout.

### The template cache

The fixture repo (~25 git operations) builds once per content key — `sha256(scrub-workspace.sh + scrub-fixtures.sh)` — and is snapshotted as a tar into `.fixture-cache/` at the repo root (gitignored, machine-local, newest 3 keys kept). Warm runs extract the snapshot and local-clone (sharing git objects), which skips the rebuild and cuts per-run disk writes by ~90%. A known-answer tripwire (the rollback scenario must read ALARM) re-runs on every warm restore; any disagreement deletes the snapshot and reruns cold, so a stale cache can never test green on a lie. `FIXTURES_REBUILD=1` forces a fresh snapshot; deleting `.fixture-cache/` is always safe. CI runners start cold every time and are unaffected. The prompt battery caches raw assemblies under its own content key in the same directory.

## The rule

Behavior changes carry their check changes in the same commit. A red suite after your edit means the suite disagrees with your change; that is the suite doing its job. Either your change is wrong, or the check needs updating *because you decided the behavior should differ*. Both are fine; silently deleting a check is not — and new checks must be machine contracts (structure, behavior, coupling), never prose pins.

## When it goes red

Read the failing check's name first; they're written as sentences ("rollback below fork era -> ALARM"). The `want=`/`got=` lines below each failure show the divergence. Under `--parallel`, each background section logs to its own file and output is merged in order afterward — a failure still names its check exactly as in the sequential run.

## When it tests itself

Its own CI run fires on every `.github/**` push, including changes to this suite, so a broken checker gets caught by itself.

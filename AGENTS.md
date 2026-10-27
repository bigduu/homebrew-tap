# Homebrew tap delivery contract

Use the complete local [delivery-flow/v1](docs/delivery-workflow.md),
[Actions audit](docs/ci-workflow-audit.md) and
[README maintenance guide](README.md#automatic-tap-updates). The shared documents
retain their identified audit snapshots; check this local guide and live evidence
for current activation. Give every
bounded Issue one owner, isolated worktree and branch. Preserve other agents'
checkouts, queued runs, review findings and exact source/asset evidence.

## Consumer phases

This repository consumes published products. It has no product dev or release
branch and does not build Bamboo, Lotus Next or Bodhi. Human feature PRs and
automatic version-update PRs target `main`; their own Unit and installation E2E
must pass before merge. Main stores accepted definitions, URLs, versions and
hashes. It must not repeat the same candidate test or compilation after merge.

- `check.yml` owns ordinary PR contract tests and invokes the reusable
  `check-tap.yml` for native acceptance. Its stable `Tap Acceptance` aggregate
  requires routing, Unit and both native checks to succeed.
- `update-tap.yml` owns its exact prepared automatic candidate, immutable
  snapshot, native audit and final head/base/review/release checks. Do not remove
  that reliable audit merely because its bot PR also has a pending check.
- `check-tap.yml` is the one native implementation: ARM installation, original
  signing verification, explicit Intel rejection for the ARM-only cask and the
  supported formula checks on both architectures. These are installation tests,
  not another upstream product test suite.

The implementation from #24/PR25 makes automatic PR checks authenticate the
original updater's Unit and per-architecture native results with `scripts/tap-audit-proof.cjs`, checked
out from the exact trusted PR base. The PR body run/attempt marker is only a
locator. Admission verifies the updater workflow ID/path, canonical repository,
main controller/event/base, immutable snapshot, exact live PR head/base/tree and
rendered-only update, plus successful original prepare and selected native job
attempts. No candidate formula or downloaded code executes during classification.
The existing `update-tests` and native check names represent these real proofs;
they do not pass on a skipped or neutral original result.

The original updater remains the only automatic native executor. PR proof jobs
wait only for their selected producer jobs, never for final merge or the whole
updater run's conclusion. Merge-only reruns retain the original prepare/snapshot
attempt. Failed native targets can rerun alone with those same inputs: retain
successful sibling jobs, verify each latest target's actual attempt, and reject
a newer failed/skipped attempt or a replaced prepare. Historical snapshots remain
usable by their existing updater merge path; they cannot stand in as new proof.
The first human PR landing the verifier runs real Unit and native checks because
the old base has no verifier. That bootstrap route admits no automatic reuse.

Main push performs no audit. A scheduled/manual updater using the trusted main
workflow is still the candidate validation phase. Do not trust a branch prefix,
bypass required checks, change protection, or add write credentials to deduplicate
checks. PR26 first exercised the original updater: run40430189865 passed its
prepare, ARM, Intel and merge jobs. Additional PR run40430245940 expired awaiting
approval with zero jobs; preserve that failure, not a claim that PR proof ran.
Do not repeat installation to rewrite it as successful. A later real candidate
must establish its own exact original and PR-proof evidence.

## Unchanged scheduled updates

The updater checks out its actual workflow SHA and first runs
`node scripts/tap-update.cjs scan`. This is only a read-only routing decision from current metadata and the
necessary Jiandu source archive hash; it grants no preparation or merge authority.
An explicit false skips Unit, PR preparation, snapshot upload, native checks and
merge. Missing/unknown output or a failed scan fails the job; never treat it as
false. A no-op has no reusable Unit/native proof.

An explicit true runs `Run update contracts` once before `Prepare one exact
version PR`. Prepare independently rereads releases and retains its complete
asset-download verification and final fresh guards. No scan result or saved
metadata replaces that verification. The manual `probe` command keeps its
existing download-verification behavior. All snapshot and proof contracts stay
unchanged. Subsequent no-op schedules40463241962/40506017802 historically still
ran Unit; the new route removes that repetition, not their original outcomes.

## Exact published inputs

Accept only final stable upstream releases and their real downloaded bytes.
Preserve source/tag, version, asset ID/size/digest, candidate base/head/tree and
native audit run/attempt. Never edit a digest to fit unexpected bytes, select
moving `latest` as an installed identity, change architecture/dependencies as
part of a version bump, or rebuild an upstream product to replace missing assets.

Jiandu's current formula still compiles from its released source with Cargo.
True zero downstream compilation requires a separate verified prebuilt Jiandu
producer and formula migration. Do not invent a release URL or hide this
remaining dependency behind `brew install`. Nova, Magpie and Bodhi consume
published binaries/packages already.

## Commands and guarded admission

Run once for the changed feature/update source:

```sh
node --test scripts/*.test.cjs
actionlint .github/workflows/check.yml .github/workflows/check-tap.yml .github/workflows/update-tap.yml
```

`node scripts/tap-update.cjs scan` reads the update decision without downloading
large installer assets. `node scripts/tap-update.cjs probe` retains its full
read-only verification path. Both use the current gh account.
Native installation tests run only in disposable CI runners, not on the user's
Mac. Use failed-job reruns with the same accepted candidate and original retained
outputs; a moved source or input requires fresh affected evidence.

Immediately before merging, verify the live exact head/base, latest release
identities, original audit outcomes, unresolved reviews and branch protection.
Use expected-head merge and verify the landed tree. Preserve uncertain API write
results and read them back before retrying. Do not force-push human branches;
the existing updater's bounded lease for its own reconstructable bot candidate
is not general permission to rewrite another owner's branch.

Report actual commands, source and results, including pending/failed/skipped
states. Historical signing, package and recovery contracts retain their own
requirements. A new agent must read these files rather than infer an exception
from an earlier chat.

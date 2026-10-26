# Homebrew tap delivery contract

Use the shared [delivery-flow/v1](https://github.com/bigduu/Zenith/blob/main/docs/delivery-workflow.md)
and [README maintenance guide](README.md#automatic-tap-updates). Give every
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

After #24 lands, automatic PR checks authenticate the original updater's Unit
and per-architecture native results with `scripts/tap-audit-proof.cjs`, checked
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
checks. This branch does not claim production activation before its reviewed
workflow/helper changes land on main; independent CI/review evidence is required.

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

`node scripts/tap-update.cjs probe` is read-only and uses the current gh account.
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

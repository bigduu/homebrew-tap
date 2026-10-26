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
  `check-tap.yml` for native acceptance.
- `update-tap.yml` owns its exact prepared automatic candidate, immutable
  snapshot, native audit and final head/base/review/release checks. Do not remove
  that reliable audit merely because its bot PR also has a pending check.
- `check-tap.yml` is the one native implementation: ARM installation, original
  signing verification, explicit Intel rejection for the ARM-only cask and the
  supported formula checks on both architectures. These are installation tests,
  not another upstream product test suite.

The main-push rerun is removed by this slice. Complete automatic-PR deduplication
remains part of #24: a second trigger must verify the original candidate audit
or delegate to its single owner. Do not substitute a skipped/success stub,
trust a spoofable branch prefix, bypass required checks, or wait for final merge
from a gate on which that same merge depends. Until this authenticated handoff
is delivered, do not claim every automatic candidate has zero repeated audits.

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

# bigduu Homebrew tap

[English](README.md) · [简体中文](README.zh-CN.md)

This tap installs [Bodhi AI](https://github.com/bigduu/Bodhi-AI) together with the [Jiandu](https://github.com/bigduu/Jiandu), [Nova](https://github.com/bigduu/Nova), and [Magpie](https://github.com/bigduu/Magpie) command-line tools.

```sh
brew tap bigduu/tap
brew trust bigduu/tap
brew install --cask bigduu/tap/bodhi
```

Homebrew requires explicit trust to load formula dependencies from a third-party tap. `brew trust bigduu/tap` trusts this tap, including future packages from it.

The Bodhi cask selects the Apple Silicon or Intel DMG automatically. It installs `jiandu` and `nova` as Homebrew formula dependencies. Bodhi already bundles its Bamboo backend. Homebrew manages the two command-line tools separately so `brew upgrade` can update them. Magpie is not a Bodhi cask dependency — install it separately when you need the Telegram/Feishu bridge.

To install only one of the command-line tools, use its fully qualified name; Homebrew trusts that item for the install:

```sh
brew tap bigduu/tap
brew install bigduu/tap/nova     # macOS only; installs the Nova release archive
brew install bigduu/tap/jiandu   # compiles Jiandu from its source tag with Rust
brew install bigduu/tap/magpie   # macOS / Linux x86_64; Magpie IM bridge for Bamboo
```

Check the installed tools with `jiandu --help`, `nova --version`, and `magpie --version`. From Jiandu 0.3.0, `--session-id` / `--project-id` are optional defaults — the host can pass identity per MCP call; installing the formula does not start a background service or configure an MCP host. Nova CLI also needs its own host configuration and macOS permissions for computer control. From Nova 0.3.0, macOS `nova mcp` expects a separately installed matching Nova.app (development preview, not in this tap) with Screen Recording and Accessibility granted to that app.

**Current release signing:** Bodhi `2026.9.20` is ad-hoc signed and has no notarization ticket. During cask installation, Homebrew automatically removes download quarantine from the installed Bodhi app, re-signs it locally with an ad-hoc signature while keeping the hardened runtime, and verifies the signature. This is the same local workaround as Bodhi’s self-sign script; the downloaded DMG remains checksum-verified and unchanged. `spctl` still rejects the app because ad-hoc signing is not Developer ID signing. This procedure skips Gatekeeper’s quarantine-based first-launch assessment and may require macOS privacy permissions to be granted again after upgrades. Remove the cask postflight steps when Bodhi publishes a Developer ID signed and notarized DMG (tracked in [Bodhi #75](https://github.com/bigduu/Bodhi-AI/issues/75)).

The Nova formula installs the CLI only. The separately published Nova.app archive is labelled development-only and is not part of this cask. Jiandu stores user memory under its own data root; uninstalling the formula does not delete that data.

Maintainers: update the cask and formula versions only after their upstream release assets are final. Copy SHA-256 values from the release assets and verify the downloaded bytes before merging. Test both macOS architectures when changing the Bodhi cask.

## Automatic tap updates

The `Update tap releases` workflow checks the latest published stable releases of Bodhi, Jiandu, and Nova every six hours. It also supports a manual run from `main`. When all three match, it performs a read-only no-op. The updater refuses downgrades and changed digests at the same version. Bodhi's two DMGs and Nova's universal CLI archive must match their published asset digests. Jiandu is built from its released source tag, so the updater downloads its source archive to verify the SHA-256 even for a no-op.

For new versions, it resolves each upstream tag to an exact source commit and verifies all selected downloads, then opens one `automation/tap-<release-identity>` PR containing only the necessary cask/formula versions, URLs, and hashes. Dependencies and installation behavior stay intact. A snapshot fixes all three release identities, tap base, PR head, and candidate tree. The same workflow audits, fetches, and installs that exact candidate on Apple Silicon and Intel using the normal tap checks. It rechecks the releases, downloads, PR head/base, reviews, and required checks before merging the exact head. Version updates never push directly to `main`.

No PAT or additional secret is required. Repository administrators must enable **Settings → Actions → General → Allow GitHub Actions to create and approve pull requests**. Keep the default workflow permission at read-only; only the updater's prepare and merge jobs request `contents: write` and `pull-requests: write`. The updater runs its own checks because PR workflows created with `GITHUB_TOKEN` can require approval. Branch protection continues to apply to its merge.

If a release or PR changes during validation, a check fails, or a review requests changes, the workflow stops and leaves the PR for inspection. Rerun the updater after correcting the failure. When `main` has advanced, a later run can refresh its own bot-authored candidate if its diff can be reconstructed solely from the admitted releases, using an exact-head force-with-lease before repeating both architecture checks. It preserves human edits and requested changes. A competing automated release PR, stale orphan branch, or previously closed release PR requires maintainer review: close obsolete PRs and delete their automation branches before running again. The updater does not undo a maintainer's closure.

GitHub's merge endpoint guards the PR head but has no atomic expected-base option. The updater checks `main` immediately before the merge and verifies the landed tree afterwards; a concurrent base change in that final API interval is reported as a failure.

Maintainer checks:

```sh
node --test scripts/tap-update.test.cjs
actionlint .github/workflows/check.yml .github/workflows/check-tap.yml .github/workflows/update-tap.yml
node scripts/tap-update.cjs probe # read-only; uses your existing gh authentication
```

`brew update` refreshes the tap metadata on a user's machine. Install the new application with `brew upgrade --cask bigduu/tap/bodhi`.

## License

This tap's formulae, casks and documentation are licensed under the [MIT License](./LICENSE). The installed software keeps its own license.

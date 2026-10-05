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

## License

This tap's formulae, casks and documentation are licensed under the [MIT License](./LICENSE). The installed software keeps its own license.

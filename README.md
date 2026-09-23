# bigduu Homebrew tap

This tap installs [Bodhi AI](https://github.com/bigduu/Bodhi-AI) together with the [Jiandu](https://github.com/bigduu/Jiandu) and [Nova](https://github.com/bigduu/Nova) command-line MCP servers.

```sh
brew tap bigduu/tap
brew install --cask bigduu/tap/bodhi
```

The Bodhi cask selects the Apple Silicon or Intel DMG automatically. It installs `jiandu` and `nova` as Homebrew formula dependencies. Bodhi already bundles its Bamboo backend. Homebrew manages the two command-line tools separately so `brew upgrade` can update them.

Check the installed tools with `jiandu --help` and `nova --version`. `jiandu` runs as an MCP stdio server when started with a data directory and session ID; installing it does not start a background service or configure an MCP host. Nova CLI also needs its own host configuration and macOS permissions for computer control.

**Current release limitation:** Bodhi `2026.9.20` is ad-hoc signed and has no notarization ticket. macOS Gatekeeper rejects first launch on a normal quarantined download. Homebrew installation can complete, but the app is not yet a hands-off launch for end users. A Developer ID signed and notarized Bodhi release is required before this tap can provide that experience. The tap does not remove quarantine or change macOS security settings.

The Nova formula installs the CLI only. The separately published Nova.app archive is labelled development-only and is not part of this cask. Jiandu stores user memory under its own data root; uninstalling the formula does not delete that data.

Maintainers: update the cask and formula versions only after their upstream release assets are final. Copy SHA-256 values from the release assets and verify the downloaded bytes before merging. Test both macOS architectures when changing the Bodhi cask.

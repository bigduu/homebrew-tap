cask "bodhi" do
  version "2026.11.33"
  sha256 "cbb4042ad4a174c10c046eb8abe1e18f3fe4b529e39ea38f924d9c9b1f7105b6"

  url "https://github.com/bigduu/Bodhi-AI/releases/download/app-v#{version}/Bodhi.AI_#{version}_aarch64.dmg"
  name "Bodhi AI"
  desc "Desktop AI agent with Bamboo backend"
  homepage "https://github.com/bigduu/Bodhi-AI"

  depends_on formula: ["bigduu/tap/jiandu", "bigduu/tap/nova"]
  depends_on :macos
  depends_on arch: :arm64

  app "Bodhi AI.app"

  # The current upstream DMG is ad-hoc signed. Remove download quarantine and
  # re-sign the installed copy locally while preserving its hardened runtime.
  # Remove these steps when Bodhi publishes a Developer ID notarized DMG.
  postflight_steps do
    run "/usr/bin/xattr",
        args: ["-dr", "com.apple.quarantine", "{{appdir}}/Bodhi AI.app"]
    run "/usr/bin/codesign",
        args: ["--force", "--deep", "--options", "runtime", "--sign", "-", "{{appdir}}/Bodhi AI.app"]
    run "/usr/bin/codesign",
        args: ["--verify", "--deep", "--strict", "{{appdir}}/Bodhi AI.app"]
  end
end

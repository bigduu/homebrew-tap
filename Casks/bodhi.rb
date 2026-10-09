cask "bodhi" do
  arch arm: "aarch64", intel: "x64"

  version "2026.10.9"
  sha256 arm:   "09a1a474b26b7852c0dc7b7ebec822cd74eebc635d0d9670143b2d5d7f0cabb5",
         intel: "beed837f1b3b0ea27f4791a280f4e98a588a8015b783a2e3dc543f126dc2314a"

  url "https://github.com/bigduu/Bodhi-AI/releases/download/app-v#{version}/Bodhi.AI_#{version}_#{arch}.dmg"
  name "Bodhi AI"
  desc "Desktop AI agent with Bamboo backend"
  homepage "https://github.com/bigduu/Bodhi-AI"

  depends_on formula: ["bigduu/tap/jiandu", "bigduu/tap/nova"]
  depends_on :macos

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

cask "bodhi" do
  version "2026.11.45"
  sha256 "ca08bad7436c392c5879fbdc3d9035f247ffac8d3a0d23e2b738220b0fea2f27"

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

cask "bodhi" do
  arch arm: "aarch64", intel: "x64"

  version "2026.9.20"
  sha256 arm:   "b072d8b37346fb3790feb2d9c46e496c9e08fe88bdaddb4997a115dcba933313",
         intel: "f10417919990fef707dc28dc65a5d5310a12cd86a955dde4662487407fd37ea8"

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

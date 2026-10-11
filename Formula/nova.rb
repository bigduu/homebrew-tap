class Nova < Formula
  desc "Computer Use MCP server for macOS desktop control"
  homepage "https://github.com/bigduu/Nova"
  url "https://github.com/bigduu/Nova/releases/download/v0.3.1/nova-v0.3.1-universal-apple-darwin.tar.gz"
  sha256 "11c0b24e796e5e2ca43b8a1a872c327ea604c2cf7bb7c3c855453b70aa9707fe"
  license "MIT"

  depends_on :macos

  def install
    bin.install "nova"
  end

  test do
    system bin/"nova", "--version"
  end
end

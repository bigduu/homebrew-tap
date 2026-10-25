class Nova < Formula
  desc "Computer Use MCP server for macOS desktop control"
  homepage "https://github.com/bigduu/Nova"
  url "https://github.com/bigduu/Nova/releases/download/v0.3.1/nova-v0.3.1-universal-apple-darwin.tar.gz"
  sha256 "303c58874e04a52f88cfc301f60c4101d0b82fe8379e01355b5d0e8c3f86acb4"
  license "MIT"

  depends_on :macos

  def install
    bin.install "nova"
  end

  test do
    system bin/"nova", "--version"
  end
end

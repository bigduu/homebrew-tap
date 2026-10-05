class Nova < Formula
  desc "Computer Use MCP server for macOS desktop control"
  homepage "https://github.com/bigduu/Nova"
  url "https://github.com/bigduu/Nova/releases/download/v0.3.0/nova-v0.3.0-universal-apple-darwin.tar.gz"
  sha256 "fb9dff85afb578fe5d9900947ef318fc73eea83cc8658053dd1b0170f5491d8a"
  license "MIT"

  depends_on :macos

  def install
    bin.install "nova"
  end

  test do
    system bin/"nova", "--version"
  end
end

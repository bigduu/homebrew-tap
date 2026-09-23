class Nova < Formula
  desc "Computer Use MCP server for macOS desktop control"
  homepage "https://github.com/bigduu/Nova"
  url "https://github.com/bigduu/Nova/releases/download/v0.2.1/nova-v0.2.1-universal-apple-darwin.tar.gz"
  sha256 "e1fcf593c867f9667484ce5b7487fed710c44773106632d70c4a3b92549dab23"
  license "MIT"

  depends_on :macos

  def install
    bin.install "nova"
  end

  test do
    system "#{bin}/nova", "--version"
  end
end

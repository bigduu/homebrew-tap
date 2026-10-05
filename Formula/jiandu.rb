class Jiandu < Formula
  desc "Filesystem memory and MCP server for AI agents"
  homepage "https://github.com/bigduu/Jiandu"
  url "https://github.com/bigduu/Jiandu/archive/refs/tags/v0.3.0.tar.gz"
  sha256 "2b9b22fcfb8906f1fc5328966b49e69f65a56f1879702e688aef27b3e327074a"
  license "MIT"

  depends_on "rust" => :build

  def install
    system "cargo", "install", *std_cargo_args(path: "crates/jiandu-mcp")
  end

  test do
    assert_match "Usage:", shell_output("#{bin}/jiandu --help")
  end
end

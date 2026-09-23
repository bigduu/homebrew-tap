class Jiandu < Formula
  desc "Filesystem memory and MCP server for AI agents"
  homepage "https://github.com/bigduu/Jiandu"
  url "https://github.com/bigduu/Jiandu/archive/refs/tags/v0.2.0.tar.gz"
  sha256 "93bfd076e55a944be76d22318b80dab1bd0e93ed8eeddec886d29b29b76c1514"
  license "MIT"

  depends_on "rust" => :build

  def install
    system "cargo", "install", *std_cargo_args(path: "crates/jiandu-mcp")
  end

  test do
    assert_match "Usage:", shell_output("#{bin}/jiandu --help")
  end
end

class Jiandu < Formula
  desc "Filesystem memory and MCP server for AI agents"
  homepage "https://github.com/bigduu/Jiandu"
  url "https://github.com/bigduu/Jiandu/archive/refs/tags/v0.5.0.tar.gz"
  sha256 "2e937aec56d447727226834c765decbebfea851c8549d70094597c8a82482923"
  license "MIT"

  depends_on "rust" => :build

  def install
    system "cargo", "install", *std_cargo_args(path: "crates/jiandu-mcp")
  end

  test do
    assert_match "Usage:", shell_output("#{bin}/jiandu --help")
  end
end

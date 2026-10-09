class Jiandu < Formula
  desc "Filesystem memory and MCP server for AI agents"
  homepage "https://github.com/bigduu/Jiandu"
  url "https://github.com/bigduu/Jiandu/archive/refs/tags/v0.3.1.tar.gz"
  sha256 "5e7567a6f2d782147836bf26166e24ed40bdaf764e8243dcafb0e402cc69226c"
  license "MIT"

  depends_on "rust" => :build

  def install
    system "cargo", "install", *std_cargo_args(path: "crates/jiandu-mcp")
  end

  test do
    assert_match "Usage:", shell_output("#{bin}/jiandu --help")
  end
end

class Jiandu < Formula
  desc "Filesystem memory and MCP server for AI agents"
  homepage "https://github.com/bigduu/Jiandu"
  url "https://github.com/bigduu/Jiandu/archive/refs/tags/v0.4.0.tar.gz"
  sha256 "f6fb725a66544bf967a33de407a3e9108e90952443625e1e46f4ce58ee8dce4b"
  license "MIT"

  depends_on "rust" => :build

  def install
    system "cargo", "install", *std_cargo_args(path: "crates/jiandu-mcp")
  end

  test do
    assert_match "Usage:", shell_output("#{bin}/jiandu --help")
  end
end

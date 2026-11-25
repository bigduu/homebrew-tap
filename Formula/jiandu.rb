class Jiandu < Formula
  desc "Filesystem memory and MCP server for AI agents"
  homepage "https://github.com/bigduu/Jiandu"
  url "https://github.com/bigduu/Jiandu/releases/download/v0.5.1/jiandu-v0.5.1-universal-apple-darwin.tar.gz"
  sha256 "0428cf3942fb36751951d945642101df4223f7137d80371ad1d9c79fdc9cdd2c"
  license "MIT"

  on_macos do
    revision 1
  end

  on_linux do
    url "https://github.com/bigduu/Jiandu/archive/refs/tags/v0.5.1.tar.gz"
    sha256 "ff1915642136a3875d633549278e6b23176342a28d9cfd30aa1d6f910fa021f0"

    depends_on "rust" => :build
  end

  def install
    if OS.mac?
      bin.install "jiandu"
    else
      system "cargo", "install", *std_cargo_args(path: "crates/jiandu-mcp")
    end
  end

  test do
    assert_match "Usage:", shell_output("#{bin}/jiandu --help")
  end
end

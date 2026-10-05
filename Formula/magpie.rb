class Magpie < Formula
  desc "Standalone Telegram/Feishu IM connector for Bamboo"
  homepage "https://github.com/bigduu/Magpie"
  license "MIT"

  on_macos do
    url "https://github.com/bigduu/Magpie/releases/download/v0.1.2/magpie-v0.1.2-universal-apple-darwin.tar.gz"
    sha256 "089b9ca5f11e54ea40ae7263643cc4dcc5cb22a551f404ba0ec828e57b011971"
  end

  on_linux do
    on_intel do
      url "https://github.com/bigduu/Magpie/releases/download/v0.1.2/magpie-v0.1.2-x86_64-unknown-linux-gnu.tar.gz"
      sha256 "d28dff819744c73a4c6fda98e6ba3b79d6838a878d12ea60e19cbe0737607c93"
    end
    # The Linux build links the system OpenSSL (native-tls pin in Cargo.toml).
    depends_on "openssl@3"
  end

  def install
    bin.install "magpie"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/magpie --version")
  end
end

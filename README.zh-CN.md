# bigduu Homebrew tap

[English](README.md) · [简体中文](README.zh-CN.md)

这个 tap 用来安装 [Bodhi AI](https://github.com/bigduu/Bodhi-AI)，以及 [简牍 Jiandu](https://github.com/bigduu/Jiandu) 和 [Nova](https://github.com/bigduu/Nova) 两个命令行 MCP 服务。

```sh
brew tap bigduu/tap
brew trust bigduu/tap
brew install --cask bigduu/tap/bodhi
```

Homebrew 要求显式信任第三方 tap，才能加载其中的 formula 依赖。`brew trust bigduu/tap` 会信任这个 tap，包括它以后发布的包。

Bodhi cask 会自动选择 Apple Silicon 或 Intel 的 DMG，并把 `jiandu` 和 `nova` 作为 Homebrew formula 依赖一起安装。Bodhi 已经内置了 Bamboo 后端。两个命令行工具由 Homebrew 单独管理，这样 `brew upgrade` 可以更新它们。

如果只想安装其中一个命令行 MCP 服务，使用完整名称即可，Homebrew 会为这次安装信任该条目：

```sh
brew tap bigduu/tap
brew install bigduu/tap/nova     # 仅限 macOS；安装 Nova 的 release 压缩包
brew install bigduu/tap/jiandu   # 用 Rust 从源码 tag 编译简牍
```

可以用 `jiandu --help` 和 `nova --version` 检查已安装的工具。当前的 `jiandu` formula（v0.2.0）需要带上数据目录和会话 ID 启动，才会作为 MCP stdio 服务运行；安装它不会启动后台服务，也不会配置任何 MCP 宿主。Nova CLI 同样需要单独配置宿主，并且电脑操作需要 macOS 权限。

**当前版本的签名情况：**Bodhi `2026.9.20` 是 ad-hoc 签名，没有公证票据。安装 cask 时，Homebrew 会自动移除已安装 Bodhi 应用的下载隔离标记（quarantine），在保留 hardened runtime 的同时用 ad-hoc 签名在本机重新签名，并校验签名。这和 Bodhi 自签脚本是同一种本地变通方法；下载的 DMG 经过校验和验证，本身不会被修改。`spctl` 仍会拒绝这个应用，因为 ad-hoc 签名不是 Developer ID 签名。这个流程跳过了 Gatekeeper 基于隔离标记的首次启动评估，升级后可能需要重新授予 macOS 隐私权限。等 Bodhi 发布 Developer ID 签名并公证的 DMG 后，应删除 cask 的 postflight 步骤（进度见 [Bodhi #75](https://github.com/bigduu/Bodhi-AI/issues/75)）。

Nova formula 只安装命令行程序。单独发布的 Nova.app 压缩包标注为仅供开发使用，不包含在这个 cask 中。简牍把用户记忆保存在它自己的数据根目录下；卸载 formula 不会删除这些数据。

维护者：只有在上游 release 资产最终确定后，才更新 cask 和 formula 的版本。从 release 资产复制 SHA-256 值，并在合并前校验下载的字节。修改 Bodhi cask 时，请在两种 macOS 架构上测试。

## 许可证

本 tap 的 formula、cask 和文档采用 [MIT 许可证](./LICENSE)。所安装的软件保留各自的许可证。

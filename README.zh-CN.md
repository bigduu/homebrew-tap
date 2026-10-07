# bigduu Homebrew tap

[English](README.md) · [简体中文](README.zh-CN.md)

这个 tap 用来安装 [Bodhi AI](https://github.com/bigduu/Bodhi-AI)，以及 [简牍 Jiandu](https://github.com/bigduu/Jiandu)、[Nova](https://github.com/bigduu/Nova) 和 [Magpie](https://github.com/bigduu/Magpie) 命令行工具。

```sh
brew tap bigduu/tap
brew trust bigduu/tap
brew install --cask bigduu/tap/bodhi
```

Homebrew 要求显式信任第三方 tap，才能加载其中的 formula 依赖。`brew trust bigduu/tap` 会信任这个 tap，包括它以后发布的包。

Bodhi cask 会自动选择 Apple Silicon 或 Intel 的 DMG，并把 `jiandu` 和 `nova` 作为 Homebrew formula 依赖一起安装。Bodhi 已经内置了 Bamboo 后端。两个命令行工具由 Homebrew 单独管理，这样 `brew upgrade` 可以更新它们。Magpie 不是 Bodhi cask 的依赖——需要 Telegram/飞书桥接时再单独安装。

如果只想安装其中一个命令行工具，使用完整名称即可，Homebrew 会为这次安装信任该条目：

```sh
brew tap bigduu/tap
brew install bigduu/tap/nova     # 仅限 macOS；安装 Nova 的 release 压缩包
brew install bigduu/tap/jiandu   # 用 Rust 从源码 tag 编译简牍
brew install bigduu/tap/magpie   # macOS / Linux x86_64；Bamboo 的 IM 桥接
```

可以用 `jiandu --help`、`nova --version` 和 `magpie --version` 检查已安装的工具。从简牍 0.3.0 起，`--session-id` / `--project-id` 是可选默认值，宿主可以在每次 MCP 调用时传入身份；安装它不会启动后台服务，也不会配置任何 MCP 宿主。Nova CLI 同样需要单独配置宿主，并且电脑操作需要 macOS 权限。从 Nova 0.3.0 起，macOS 上的 `nova mcp` 需要另外安装同版本的 Nova.app（开发预览版，不在本 tap 里），并把屏幕录制与辅助功能权限授给该应用。

**当前版本的签名情况：**Bodhi `2026.9.20` 是 ad-hoc 签名，没有公证票据。安装 cask 时，Homebrew 会自动移除已安装 Bodhi 应用的下载隔离标记（quarantine），在保留 hardened runtime 的同时用 ad-hoc 签名在本机重新签名，并校验签名。这和 Bodhi 自签脚本是同一种本地变通方法；下载的 DMG 经过校验和验证，本身不会被修改。`spctl` 仍会拒绝这个应用，因为 ad-hoc 签名不是 Developer ID 签名。这个流程跳过了 Gatekeeper 基于隔离标记的首次启动评估，升级后可能需要重新授予 macOS 隐私权限。等 Bodhi 发布 Developer ID 签名并公证的 DMG 后，应删除 cask 的 postflight 步骤（进度见 [Bodhi #75](https://github.com/bigduu/Bodhi-AI/issues/75)）。

Nova formula 只安装命令行程序。单独发布的 Nova.app 压缩包标注为仅供开发使用，不包含在这个 cask 中。简牍把用户记忆保存在它自己的数据根目录下；卸载 formula 不会删除这些数据。

维护者：只有在上游 release 资产最终确定后，才更新 cask 和 formula 的版本。从 release 资产复制 SHA-256 值，并在合并前校验下载的字节。修改 Bodhi cask 时，请在两种 macOS 架构上测试。

## 自动更新 tap

`Update tap releases` 工作流每六小时检查一次 Bodhi、简牍 Jiandu、Nova 的最新公开稳定 release，也可以在 `main` 手动运行。三包都匹配时只读退出；拒绝降级，以及同版本下载摘要被替换的情况。Bodhi 的两种 DMG 和 Nova 的 universal CLI 压缩包必须匹配 release 资产摘要。简牍从发布的源码 tag 编译，因此即使版本未变，也会实际下载源码 archive 校验 SHA-256。

出现新版本时，更新器先解析每个上游 tag 对应的确切源码提交，并下载校验所选资产，再创建一个 `automation/tap-<release-identity>` PR，只修改必要 cask/formula 的版本、URL 和哈希；保留全部依赖和安装行为。快照固定三包的 release 身份、tap 基线、PR head 和候选 tree。同一次工作流在 Apple Silicon 和 Intel 上对这个确切候选运行正常 tap 的 audit、下载和安装检查；合并前再次核对 release、下载内容、PR head/base、review 和 required checks。版本更新始终经过 PR，不直接推送 `main`。

无需 PAT 或新增 secret。仓库管理员需要启用 **Settings → Actions → General → Allow GitHub Actions to create and approve pull requests**。工作流默认权限保持只读，只有更新器的 prepare 和 merge job 申请 `contents: write` 与 `pull-requests: write`。由于 `GITHUB_TOKEN` 创建的 PR 工作流可能需要批准，更新器在同一次运行内完成检查；分支保护仍然约束合并。

如果校验中 release 或 PR 发生变化、检查失败、review 要求修改，工作流会停止并保留 PR。修复后重新运行更新器。当 `main` 已前进，后续运行可以安全刷新自身 bot 创建、且 diff 能完全由已准入 release 重建的候选：用指定旧 head 的 force-with-lease 更新后重新执行两种架构检查，保留人类修改和 requested changes。存在其他自动 release PR、过期孤立分支或对应 release PR 已被关闭时，需要维护者检查：关闭过期 PR、删除对应自动分支，再重新运行。更新器不会撤销维护者关闭 PR 的决定。

GitHub 合并接口只能原子校验 PR head，没有 expected-base 参数。更新器在合并请求前紧邻检查 `main`，并核对实际落地的 tree；如果最终 API 调用间隙有其他提交推进基线，会报告失败。

维护者检查：

```sh
node --test scripts/tap-update.test.cjs
actionlint .github/workflows/check.yml .github/workflows/check-tap.yml .github/workflows/update-tap.yml
node scripts/tap-update.cjs probe # 只读检查，使用已有 gh 登录状态
```

用户机器上的 `brew update` 用来刷新 tap 元数据；使用 `brew upgrade --cask bigduu/tap/bodhi` 安装新版应用。

## 许可证

本 tap 的 formula、cask 和文档采用 [MIT 许可证](./LICENSE)。所安装的软件保留各自的许可证。

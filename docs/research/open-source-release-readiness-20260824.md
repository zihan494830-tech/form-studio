# Form Studio 开源发布依据与边界（2026-08-24）

## 结论

本轮采用“最小可维护开源基线”：可复现安装、Node 22/24 CI、语法/结构/行为门禁、依赖更新、私密漏洞入口、贡献模板、敏感文件排除和发布前证据清单。没有引入容器、代码扫描平台、覆盖率门槛或自动发布，因为当前本地 Alpha 尚无远端、正式身份 provider 和部署合同，这些投入不能消除已证实的产品阻塞。

维护者已选择 Apache-2.0。仓库包含 Apache 官方未改写的完整 `LICENSE`，`package.json` 与 lockfile 使用 SPDX 标识 `Apache-2.0`；贡献说明明确要求贡献者只提交有权授权的内容。

本轮不生成 `NOTICE` 或批量写入版权所有者，因为仓库没有已确认的公司法定名称或权属声明。Apache 官方对项目采用许可的说明是包含 `LICENSE`，并“考虑”加入 `NOTICE`；只有存在需要随衍生作品传递的署名信息时才新增 `NOTICE`。公司正式接收或确权后，应由权利主体提供法定名称，再单独评估版权声明和贡献协议。

## 采用的行业依据

- [GitHub Community Profile](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/about-community-profiles-for-public-repositories)：README、LICENSE、CONTRIBUTING、CODE_OF_CONDUCT、SECURITY 和 Issue 模板是公开仓库的社区健康入口。
- [npm ci](https://docs.npmjs.com/cli/v11/commands/npm-ci/)：CI/部署应从锁文件做冻结安装；依赖声明与 lock 不一致时直接失败且不改写 lock。
- [GitHub Node.js CI](https://docs.github.com/en/actions/tutorials/build-and-test-code/nodejs) 与 [actions/setup-node](https://github.com/actions/setup-node)：显式选择 Node 版本、缓存 npm 下载并执行干净安装。工作流把官方 Action 固定到 v7 tag 当日 commit，由 Dependabot 后续更新。
- [Node.js release policy](https://nodejs.org/en/about/previous-releases)：生产只用 Active/Maintenance LTS；本项目验证当前仍受支持的 Node 22 和 24，不把 Current 26 当最低要求。
- [Dependabot options](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference)：npm 与 GitHub Actions 每周检查，限制同时打开的更新 PR 数量。
- [GitHub secret scanning scope](https://docs.github.com/en/code-security/reference/secret-security/secret-scanning-scope)：公开仓库可使用 secret scanning；push protection 仍有模式与大 push 边界，不能代替发布前本地/历史扫描。
- [OpenSSF Scorecard](https://openssf.org/scorecard/)：远端建立后再评估分支保护、依赖更新、危险工作流和二进制制品等自动指标，不用单一分数冒充产品安全证明。
- [OSI approved licenses](https://opensource.org/licenses)：开源必须授予使用、修改和分享权。MIT 简短宽松；Apache-2.0 同样宽松并提供明确专利授权。许可证是维护者的法律/治理选择，不由代码审计代拍板。

## 项目取舍与升级触发条件

| 项目 | 当前做法 | 升级触发条件 |
|---|---|---|
| CI | Ubuntu 上 Node 22/24，各跑完整 `npm run check` | 出现正式 Windows/macOS 支持承诺后增加 OS matrix |
| 依赖 | lockfile + `npm ci` + `npm audit --audit-level=high` + 每周 Dependabot | 出现生产部署或高价值供应链威胁时增加 SBOM/签名 |
| 安全报告 | `SECURITY.md` 规定 GitHub 私密报告 | 建立远端后启用 private vulnerability reporting、secret scanning 与 push protection |
| 发布 | 人工检查 changelog、包清单、Git diff、完整测试 | 有稳定远端和 release cadence 后再自动生成 Release |
| 许可证 | Apache-2.0 官方全文 + package SPDX；暂不虚构 `NOTICE` 权属主体 | 公司正式确权或出现必须传递的署名信息时补充 `NOTICE`/贡献协议 |

## 本轮证据

- 整理前隔离端口基线为 155/155；修复后完整 `npm run check` 通过 structure、121 个源码文件的 syntax 和 160/160 Playwright 测试（Contract 60、Runtime 44、E2E 56）。
- `npm audit`：0 个已知漏洞；直接和传递依赖均声明 SPDX 许可证。
- 根 `LICENSE` 来自 Apache 官方原文；package 与 lockfile 均声明 `Apache-2.0`。
- 最终比对中本地 `LICENSE` 与 Apache 官方原文逐字一致，SHA-256 均为 `CFC7749B96F63BD31C3C42B5C471BF756814053E847C10F3EB003417BC523D30`；`npm pack --dry-run` 包含且只包含一份根许可证。
- 当前工作树与全部 Git 历史的高信号凭据扫描：未命中；没有 >= 500 KiB 的跟踪文件。
- `npm pack --dry-run` 曾夹带 `.reasonix/`，已通过 `.gitignore` 排除；最终复查不再包含 `.reasonix/`、`.learnings/`、`logs/`、SQLite 或测试产物。
- 当前无 Git 远端，因此 GitHub 设置项、真实 CI 运行、Community Profile 分数和私密漏洞入口只能在推送后验证，不能在本地伪造为已完成。

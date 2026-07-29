# 第三方代码与素材声明

- 更新时间：`2026-07-29 11:43:32`
- 执行工具 / 模型：`Codex（GPT-5）`

本文记录图语家微信小程序当前直接复用或在运行时访问的第三方代码、图符、插件与服务。根目录 `LICENSE` 只覆盖本项目代码及 GPLv3 派生代码，不会改变图符、在线候选或插件各自的许可条件。

## 1. CBoard 代码与默认板

- 项目：CBoard
- 来源：https://github.com/cboard-org/cboard
- 本项目使用的 fork：https://github.com/lightcoloror/cboard/tree/feature/tuyujia-mvp
- 已验证基线提交：`055e26e59d38f5f0db8136fc00e4234bffdae23c`
- 原始版权：Copyright © 2017-2024, Assistive Technology LLC & CBoard contributors
- 许可证：GNU General Public License version 3
- 使用范围：`src/common/communicationSupport` 纯核心、`src/api/boards.json` 默认板、中文翻译和默认图符生成输入。
- 修改说明：图语家在 2026 年对通信核心、中文分词、图文匹配、双向会话、微信存储适配及图符归属进行了修改和扩展。修改后的组合程序继续按 `GPL-3.0-only` 分发。

## 2. 随包图符

当前生成清单为 46 个板、871 张图卡和 798 个去重 PNG。图卡归属测试按上游来源识别为：

| 来源 | 图卡数 | 许可证 / 状态 | 署名与来源 |
| --- | ---: | --- | --- |
| Mulberry Symbols | 792 | CC BY-SA 4.0 | https://mulberrysymbols.org/ |
| ARASAAC | 62 | CC BY-NC-SA 4.0 | 作者 Sergio Palao；https://arasaac.org/ |
| CBoard Symbols | 17 | CBoard 上游未提供逐图独立许可证 | https://github.com/cboard-org/cboard/tree/master/public/symbols/cboard |

补充说明：

- Mulberry 图符要求署名并以相同方式共享衍生素材。
- ARASAAC 图符要求署名、非商业使用并以相同方式共享；商业发布前必须单独复核或替换这些图符。
- CBoard 自有图符目前只沿用上游项目声明，不能据此推断每张图都自动获得独立的 Creative Commons 许可。
- `src/assets/emergency/manifest.json` 另行逐项记录紧急入口图片的来源、许可证和 SHA-256。
- PNG 是由上游图符转换、缩放和压色得到的派生文件；转换不会改变原图符许可证。

## 3. 运行时在线图符

### ARASAAC

- 搜索接口：https://api.arasaac.org
- 图片来源：https://static.arasaac.org
- 许可证：CC BY-NC-SA 4.0
- 行为：仅在缺词搜索启用时发送单个词；候选必须由照护者确认后才保存到本机。

### OpenSymbols

- 来源：https://www.opensymbols.org/
- 行为：由 `cboard-api` 代理返回候选，客户端不保存服务密钥。
- 许可证：不同图库可能不同，必须以每个候选返回并显示的 `license`、`author`、`sourceUrl` 和 `repoKey` 为准。例如 Mulberry 仓库候选可能为 `CC BY-SA 2.0 UK`。
- 注意：OpenSymbols 不是统一授权方，不能把某个仓库的许可证套用到全部候选。

## 4. 微信插件与平台能力

### 微信同声传译 WechatSI

- 插件提供方 ID：`wx069ba97219f66d99`
- 当前配置版本：`0.3.4`
- 使用范围：微信端语音识别与文字转语音。
- 分发状态：插件代码不存放在本 Git 仓库，由微信开发者工具和微信平台按 AppID 授权加载。
- 条款：使用和发布受微信开放平台及插件提供方当时有效的服务条款约束，不因本项目采用 GPLv3 而改变。

## 5. JavaScript 直接依赖

版本以当前 `yarn.lock` 为准。

| 依赖 | 当前安装版本 | 许可证 |
| --- | ---: | --- |
| Taro 运行时与微信插件（`@tarojs/*`） | 4.2.0 | MIT |
| React | 18.3.1 | MIT |
| `@babel/runtime` | 7.29.7 | MIT |
| `@noble/ciphers` | 1.3.0 | MIT |
| `@noble/hashes` | 1.8.0 | MIT |
| `base64-js` | 1.5.1 | MIT |
| `fflate` | 0.8.3 | MIT |
| `jszip` | 3.10.1 | MIT OR GPL-3.0-or-later |

构建和测试工具主要采用 MIT 许可；TypeScript 为 Apache-2.0。完整依赖树、精确版本和传递依赖以 `package.json`、`yarn.lock` 以及安装后各包的 `package.json` / `LICENSE` 为准。

## 6. 不纳入公共许可的用户内容

- 用户从相册、相机或文件导入的个人熟悉图片只保存在设备侧，版权和授权由上传者负责。
- AI 生成图片只按所选模型服务条款在当前设备使用，不因进入图语家而自动变成 GPL 或 Creative Commons 内容。
- 登录令牌、AppSecret、云服务密钥、个人图片和语音数据不应提交到 Git 仓库。

## 变动依据

- 意图：使代码和素材在公开、测试或再分发时能够追溯到真实来源。
- 决策：代码许可证、随包图符、在线候选、微信插件和 npm 依赖分层记录，不用一个许可证覆盖全部内容。
- 理由：GPL、CC BY-SA、CC BY-NC-SA、插件服务条款和用户私有内容的权利边界不同。
- 证据：CBoard `README.md` / `LICENSE.txt`、微信生成清单、图符归属回归、`src/assets/emergency/manifest.json`、本地安装包元数据及当前构建配置。
- 生效范围：当前 Git 仓库和由当前源码构建的微信小程序包；新增第三方来源时必须同步更新本文。

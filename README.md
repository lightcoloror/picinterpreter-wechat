# 图语家微信小程序 PoC（基于 PicInterpreter / CBoard）

- 状态：患者表达与接收理解双向闭环已实现；CBoard 全部 46 个默认板已进入分层导航；自动化测试、生产构建和微信开发者工具 E2E 已通过，真实手机仍有网络、授权与发布前验收项；源码已推送到 `lightcoloror/picinterpreter-wechat` 私有仓库，尚未公开发布
- 更新时间：`2026-07-29 11:43:32`
- 执行工具 / 模型：`Codex（GPT-5）`
- 技术栈：Taro `4.2.0`、React `18.3.1`、TypeScript、微信小程序
- 许可证：代码采用 [GNU GPL v3](LICENSE)；图符和第三方组件分别遵循各自许可证，详见 [第三方代码与素材声明](THIRD_PARTY_NOTICES.md)
- 检出与构建：本仓库与 CBoard fork 需要保持为相邻目录，详见 [独立检出与构建说明](docs/独立检出与构建说明.md)

## 当前闭环

### 患者表达

`CBoard fixture / TileDTO → 点选表达序列 → expression pipeline v1 → 候选句 → 确认 → WeChat storage port → 下次启动恢复`

### 接收理解

`照护者文字 / 语音 → 中文分词 → CBoard 本地图文匹配 → 逐词复核 / 换图 / 调序 / 删除 → 独立结果页 → 确认 → WeChat storage port`

本项目是独立的微信小程序载体，但不复制图语家的业务算法。Webpack alias `@cboard-communication-core` 直接指向 `../cboard/src/common/communicationSupport`，小程序只编写 Taro UI、平台 adapter、纯会话模型和验证脚本。

## 许可证与可复现构建

- 意图：让代码公开前具备明确的再分发边界，并让新开发者无需依赖当前电脑的绝对路径即可检出和验证。
- 决策：项目代码整体按 `GPL-3.0-only` 发布；CBoard、Mulberry、ARASAAC、OpenSymbols、WechatSI 和 npm 依赖分别保留原始来源与许可说明；构建采用 `cboard` 与本仓库相邻的双仓目录结构。
- 理由：微信产物会编译 CBoard 的 GPLv3 纯核心，内置图符又具有独立的 Creative Commons 条款，不能把全部内容笼统写成同一种许可证；当前 alias 使用相对路径，也必须公开说明对应源码如何取得。
- 证据：根目录包含完整 [GPLv3 文本](LICENSE)；[第三方代码与素材声明](THIRD_PARTY_NOTICES.md)记录代码、871 张图卡对应的来源类别、运行时在线图库与直接依赖；[独立检出与构建说明](docs/独立检出与构建说明.md)提供从空目录开始的命令和验收门。
- 生效范围：本仓库源码、由其产生的微信代码包及公开分发说明；不改变任何第三方素材的原始许可证，不代表已完成微信审核、隐私合规或正式发布。

## 变动记录

### 变动 1：独立 Taro + React 18 项目

- 意图：让已在 Web MVP 验证的图语家表达闭环进入微信小程序，同时避免搬运旧 Web UI。
- 决策：使用官方 Taro `4.2.0` TypeScript + React `18.3.1` + Webpack 5 模板，只保留微信平台插件。
- 理由：Taro 官方从 3.5 起支持 React 18；独立载体可以隔离 CBoard 的 React DOM、Material UI 和浏览器 API。
- 证据：`yarn build:weapp` 已成功生成 `dist/app.js`、`dist/pages/index/index.js`、WXML/WXSS 和微信项目配置。
- 生效范围：仅 `cboard-wechat-poc`；不修改 CBoard Web 的渲染体系，也不修改 `cboard-api`。

### 变动 2：复用 CBoard 纯核心

- 意图：让 Web 与微信共享同一份 DTO、表达和存储规则，避免双端逻辑漂移。
- 决策：通过 `@cboard-communication-core` alias 直接消费 CBoard 的 `dto.js`、`expressionPipeline.js`、`repository.js` 和 WeChat storage adapter。
- 理由：这些模块不依赖 React、DOM、Material UI 或全局 `wx`，适合跨端复用；UI 组件不具备这一边界。
- 证据：构建日志显示直接编译 `../cboard/src/common/communicationSupport/phraseSuggestions.js`；`yarn check:boundary` 会扫描应用和 8 个被消费的核心文件。
- 生效范围：PoC 的 DTO 创建、候选句、历史规范化与持久化；不包含 CBoard `src/components`。

### 变动 3：CBoard 完整默认板包

- 意图：让微信端直接复用 CBoard 已成熟的默认词汇与板层级，不再用少量演示图卡代表真实 AAC 内容。
- 决策：从 CBoard `boards.json#advanced` 生成版本化本地板包，将全部 44 个板、825 张 Tile 和 775 个唯一图片资源转换为 BoardDTO/TileDTO v1；图片压缩为 128 × 128 WebP。
- 理由：完整默认板可以覆盖患者表达、接收匹配和人工换图，同时压缩后仍能留在微信主包 2 MiB 范围内；生成脚本比手工复制更可追溯。
- 证据：`generate-cboard-default-boards.mjs`、manifest hash 和 `check:boards` 均通过；默认生产包 794 个文件、1,960,573 bytes（1.870 MiB）。
- 生效范围：患者表达图板、接收 matcher 与人工换图目录；不迁入 CBoard React DOM/MUI 编辑器。设备私有个人图卡由后续 backup 分包能力通过同一 BoardDTO 契约接入。

### 变动 4：表达序列与候选句

- 意图：完成“点图 → 词语顺序 → 句子候选 → 选择句子”的图语家核心表达闭环。
- 决策：Taro 页面只派发 reducer action，候选句全部由 CBoard `expressionPipeline v1` 生成。
- 理由：页面不应重新实现语言规则；纯 reducer 可独立测试并在未来替换 UI。
- 证据：`session.test.ts` 验证“我想要 + 水”生成“我想要水。”并验证历史恢复。
- 生效范围：最多 12 张图的本地表达会话；不包含 AI 改写或完整语言模型。

### 变动 5：微信 storage 恢复

- 意图：让确认过的表达在关闭并重新打开小程序后仍可恢复。
- 决策：把 Taro 同步 storage API 注入 CBoard 的 WeChat adapter 和通用 repository，不新增另一套 storage schema。
- 理由：继续复用中性键、Tuyujia 历史键兼容、双写、20 条上限和数据规范化逻辑。
- 证据：`communicationRepository.test.ts` 用模拟微信 API 跑通写入和读取；页面启动时读取最近一条包含 output 的 express history。
- 生效范围：当前设备的同步本地存储；不包含登录、云同步或跨设备迁移。

### 变动 6：微信 TTS 端口与平台适配

- 意图：恢复原图语家的语音输出能力，让患者确认的句子和照护者全屏展示的原话都可以朗读。
- 决策：纯 `SpeechPort` 工厂负责生成、播放、停止、超时和错误状态；`taroSpeechPort` 单独装配 WechatSI `textToSpeech` 与 `Taro.createInnerAudioContext`。患者端手动朗读，接收端进入独立展示页后自动朗读并可重播。
- 理由：浏览器 `speechSynthesis` 不能搬到微信；纯工厂与 Taro adapter 分离后既可在 Node 测试，也不会把微信运行时耦合进共享核心。
- 证据：语音端口 6 个单测覆盖插件缺失、含/不含 `retcode` 的成功响应、播放失败、主动停止与超时；启用插件版构建生成 provider `wx069ba97219f66d99`、version `0.3.4`，并已成功推送真机预览。
- 生效范围：患者表达和接收全屏展示的微信语音输出；真实发声仍要求当前 AppID 在公众平台获 WechatSI 插件授权并完成真机验收。

### 变动 7：产品品牌与技术来源分层

- 意图：让使用者只需要理解“图语家”，同时完整保留 CBoard 的代码来源和复用证据。
- 决策：导航栏、首页标题、图卡区和隐私提示统一使用“图语家”产品语言；`cboard-wechat-poc` 包名、`@cboard-communication-core` alias 与 README 技术说明保持不变。
- 理由：Logseq 的“图语家小程序”页尚未填写正式名称和简称，但“图语家”满足记录中的字符长度规则；技术底座不应成为用户操作界面的品牌负担。
- 证据：`src/app.config.ts`、`src/pages/index/index.config.ts` 和 `src/features/communication/CommunicationPage.tsx` 已不再把 CBoard 作为用户可见名称；CBoard 来源仍记录在变动 2、3。
- 生效范围：小程序用户界面与开发者工具描述；不代表微信公众平台上的正式名称、简称已经申请或审核通过。

### 变动 8：小程序凭据不进入客户端

- 意图：避免把可调用微信服务端能力的密钥打包进可下载、可反编译的小程序。
- 决策：跟踪的 `project.config.json` 继续使用游客 AppID；真实 AppID 只在本地联调时配置，AppSecret、SecretId、SecretKey 只能进入服务端密钥管理或本地未跟踪环境。
- 理由：Logseq 资料中已经出现明文小程序密钥，继续复制到客户端会扩大泄露范围；客户端只应持有公开标识和最小权限配置。
- 证据：仓库内未写入 Logseq 中的真实凭据；`scripts/check-boundary.mjs` 会拒绝客户端源码中的服务端凭据标记。
- 生效范围：`cboard-wechat-poc/src`、项目配置和后续微信 API 集成；不修改 Logseq 原文，也不替代微信后台的密钥轮换。

### 资料证据状态

- 已确认产品意图：优先发布微信小程序；实现“他人信息到图片序列”的接收闭环，以及“图片组合到自然句子/语音”的表达闭环。
- 已确认工程决策：使用 Taro + React 18 独立载体，并只复用 CBoard 的平台无关核心。
- 候选资料：`小程序开发.md` 中具体 ASR、云服务、AI 模型、资费和合规结论主要来自历史 AI 回答，必须重新验证后才能进入实现决策。
- 待用户确认：微信公众平台正式名称、简称和真实 AppID 的本地配置方式。

## 第二阶段变动记录

### 变动 9：接收匹配器解除 Web helper 依赖

- 意图：让微信端直接复用 CBoard 接收管线，同时不把 Web 默认板 JSON 和浏览器辅助函数打进小程序。
- 决策：在 Communication Support 纯核心新增 `resolvers.js`，`symbolMatching.js` 不再导入 `src/helpers.js`。
- 理由：原 helper 顶层同时导入完整 `boards.json` 和 PicSeePal 数据，即使只调用两个名称解析函数也会扩大跨端依赖面。
- 证据：`yarn check:boundary` 扫描 15 个实际消费的核心文件并禁止 Web helper/default-board 导入；微信生产构建成功。
- 生效范围：CBoard 接收匹配纯核心与微信消费者；Web 的 `src/helpers.js` 和既有组件调用不变。

### 变动 10：TileDTO 匹配元数据与微信分词降级

- 意图：确保序列化后的 `TileDTO v1` 在微信运行时仍保留同义词、排除词和语义分类，且缺少 `Intl.Segmenter` 时不逐字破坏常用照护词。
- 决策：metadata adapter 兼容 `communication.synonyms/excludeTokens/category`；字符回退新增“需要”“休息”合并规则。
- 理由：DTO 把元数据放在嵌套对象，旧 matcher 只读取扁平字段；部分微信 JS 环境不能假设存在 `Intl.Segmenter`。
- 证据：CBoard 新增 DTO matcher 与无 Intl 回归；完整相关回归合计 `31 suites / 117 tests / 3 snapshots` 通过。
- 生效范围：纯核心 metadata 与中文分词；不改变 CBoard 原始 board schema、词典优先级或在线匹配策略。

### 变动 11：真正的双向入口

- 意图：让小程序首页同时提供患者表达和照护者接收理解，而不是把第二方向藏在开发接口里。
- 决策：新增“患者表达 / 接收理解”顶层切换；原表达流程拆为独立 workspace，接收流程使用独立 workspace。
- 理由：双方角色和任务不同，显式入口比在同一长页面连续堆叠更容易理解，也更符合图语家双向沟通定位。
- 证据：TypeScript 与 ESLint 通过；Taro 生产构建生成可加载的微信页面产物。
- 生效范围：小程序首页 UI；CBoard Web 入口和 Redux 状态不变。

### 变动 12：接收端人工复核闭环

- 意图：避免低质量图文匹配直接展示给患者，给照护者一个可纠错的确认环节。
- 决策：逐词显示匹配类型和质量，支持左移、右移、删除及从 CBoard 核心词板手工换图；存在未匹配/部分匹配时禁止确认和全屏展示。
- 理由：辅助沟通的错误代价高于多一次确认；本地规则无法覆盖的词必须显式暴露，不能静默猜测。
- 证据：`receiverSession.test.ts` 覆盖三词匹配、未匹配、调序、删除、人工替换、质量恢复和历史契约。
- 生效范围：微信接收理解会话；不新增 AI、在线图片搜索或自动纠错。

### 变动 13：独立结果页与双向历史

- 意图：修复“全屏展示仍在原页面上堆图”的交互问题，并让双方已确认沟通可追溯。
- 决策：全屏结果使用顶层条件渲染，进入后只保留大图序列和返回按钮；表达与接收共用现有 repository/history schema。
- 理由：结果页必须隔离编辑界面，才能避免视觉干扰；复用 repository 可保留中性键、旧 Tuyujia 键兼容和 20 条上限。
- 证据：微信 repository 测试覆盖 `receive` 的 `pictogramSequence` 往返；生产构建成功且结果页不依赖 React DOM/MUI。
- 生效范围：当前设备本地展示与历史；不包含登录、云同步、跨设备恢复或真机 TTS。

### 变动 14：共享完整板树与分层导航

- 意图：保留 CBoard 原生板层级，让患者和照护者按熟悉分类进入子板，而不是把 825 张图片堆在同一页面。
- 决策：使用纯 `boardNavigation` trail 管理首页、进入子板、返回上级和回到首页；文件夹 Tile 只导航不进入表达，患者点图与照护者换图复用同一 `BoardNavigator`。
- 理由：板层级是 CBoard 内容模型的一部分，扁平分类会丢失上下文并让患者承担不必要的视觉搜索负担。
- 证据：根板真实渲染 29 个入口；自动化进入“饮品”后依次点“我想 / 喝 / 水”生成“我想喝水。”；导航回归验证 44 板树和文件夹排除逻辑。
- 生效范围：微信患者表达与接收端人工换图；不修改 CBoard 官方板源文件，不迁入完整图板编辑器。

### 变动 15：多板历史恢复兼容

- 意图：以后把精选板拆成多个 CBoard 板时，不让已经保存在微信本地的表达失效。
- 决策：`restoreExpressionSession` 接受单板或多板；优先用 `boardId + tileId` 精确恢复，找不到时再按稳定 `tileId` 回退。
- 理由：板归属可能随分类扩展而调整，但 CBoard 图卡 ID 才是跨板迁移时更稳定的身份；旧历史也可能没有完整板信息。
- 证据：新增回归覆盖“水”图卡从旧精选板移动到“饮品”板后仍可恢复，最终 Vitest `4 files / 12 tests` 全部通过。
- 生效范围：微信本地患者表达恢复；不迁移云端数据、不改变 repository schema，也不改接收历史格式。

### 变动 16：自动匹配与人工换图的范围分离

- 意图：让分类减少人工选图负担，同时不因为当前筛选条件降低文字转图片的召回率。
- 决策：照护者点击“生成图片序列”时仍扫描传入的全部板；只有打开“换图”面板后，候选图才按当前板和分类过滤。
- 理由：自动匹配负责尽量找到正确图片，人工换图负责让人快速浏览，两者的最优检索范围不同。
- 证据：既有“想喝水”三词闭环回归继续通过；边界扫描覆盖 `21 app files + 15 CBoard core files`，生产构建成功。
- 生效范围：微信接收理解的匹配与人工复核 UI；不改变 CBoard matcher 排序、置信度或词典规则。

### 变动 17：复用 CBoard 常用语 repository

- 意图：让患者收藏的表达在关闭小程序后仍然存在，同时沿用 Web 端已验证的数据边界。
- 决策：微信页面直接调用 CBoard `loadCommunicationSavedPhrases` 和 `saveCommunicationPhrase`；不新增表、不增加微信专用存储格式。
- 理由：现有 repository 已处理按句子去重、最新优先、20 条上限，以及中性键和旧 `tuyujia` 键双写，重复实现只会制造跨端差异。
- 证据：微信 repository 回归验证同一句重复收藏只保留最新图片序列，并确认 `cboard_communication_saved_phrases` 与 `cboard_tuyujia_saved_phrases` 都可往返。
- 生效范围：当前微信设备的常用语本地存储；不涉及登录、云同步、导入导出或跨设备合并。

### 变动 18：收藏与一键使用入口

- 意图：完成 PRD 中“表达可保存为常用语”的患者流程，让高频表达不必每次重新点图。
- 决策：候选句区域新增“收藏常用语”；患者表达页新增常用语横向列表，显示原图片缩略图和“一键使用”，直接恢复图片序列与收藏时选定的句子。
- 理由：常用语是患者侧的高频入口，应当在当前页面直接可见；独立横向卡片不会与板分类或接收端控件混在一起。
- 证据：TypeScript、ESLint 和微信生产构建通过，编译产物包含常用语面板、收藏按钮及对应 `rpx` 样式。
- 生效范围：微信患者表达工作区；接收端历史、全屏展示和自动匹配行为不变。

### 变动 19：常用语跨板恢复

- 意图：后续扩大 CBoard 默认板时，避免收藏表达因图卡改到其他板而失效。
- 决策：新增 `createExpressionSessionFromSavedPhrase`，先把保存快照按 `boardId + tileId` 映射到当前板，必要时按稳定 `tileId` 回退，再把收藏句放回候选句首位。
- 理由：常用语保存的是用户确认过的自然句，复用时既要使用当前图卡资源，也要保留原句，不能重新生成后悄悄改变表达。
- 证据：回归覆盖“水”图卡迁入新饮品板后，一键使用仍恢复新 `boardId` 且候选首句保持原收藏内容；最终 Vitest `4 files / 14 tests` 全过。
- 生效范围：微信常用语复用和 expression session；不修改 CBoard DTO、repository schema 或云端 settings。

### 变动 20：接收记录、缺图维护与 schema v1

- 意图：把一次文字匹配升级为可追溯、可纠错、可升级的照护者闭环。
- 决策：匹配后保存 draft，全屏展示后才确认；替换、删除、重排进入独立纠错日志；未匹配词按本机身份聚合，可忽略、恢复或关联现有 CBoard Tile；repository 使用 schema v1 幂等迁移并保护未来版本。
- 理由：患者历史不能混入未展示草稿，缺图状态必须真实改善下次匹配，且微信 key-value storage 需要自己的迁移契约而不是复制原 PicInterpreter Dexie。
- 证据：receiver lifecycle、missing-token、migration 与微信 repository 回归均通过；当前聚合为 `7 files / 21 tests`。
- 生效范围：微信接收理解、本机 storage 与共享 CBoard 纯核心；不进入 Settings/API，不云同步。

### 变动 21：统一双向会话

- 意图：让患者表达和照护者确认属于同一轮沟通，而不是两组孤立历史。
- 决策：复用共享 conversation session v1，30 分钟无操作自动换新，并提供“新对话”入口；只恢复当前 session 的表达，原历史继续保留。
- 理由：跨方向会话是可审计上下文的前提，draft、纠错和缺词维护记录不能误入已确认对话。
- 证据：session/repository 测试覆盖跨方向归属、空闲换新、手动重置与历史保留；微信生产构建真实编译该核心。
- 生效范围：患者表达、接收理解和本机历史；不连接 LLM、登录或云端会话。

### 变动 22：微信开发者工具 UI 自动化门

- 意图：补足“单测和构建通过但真实微信页面没有操作过”的证据缺口，并回归独立结果页不再叠图。
- 决策：引入测试专用 `miniprogram-automator 0.12.1`，按稳定中文文案点选患者图卡、保存/重启恢复、执行接收流程、进入独立展示页、验证双向历史及新对话。普通命令不自动开启开发者工具服务端口，显式一次性命令才接受官方安全确认。
- 理由：UI E2E 应只验证平台事件和持久恢复，纯算法继续留在 Vitest；持久化安全开关不能由普通测试静默修改。
- 证据：`scripts/weapp-smoke.mjs` 与 `scripts/wechat-cli-port-shim.cjs` 通过语法检查；CLI 已越过 Node 22 `.bat` 和 Windows `3799` 排除端口，服务端口 `11515` 已启用；CLI `islogin` 返回 `true`，真实项目路由、storage、`reLaunch` 和首页截图均成功，但 Taro 页面上的 `Page.getData` / 元素查询仍无响应，完整点击闭环尚未通过。
- 生效范围：本地开发者工具测试依赖和命令；不进入小程序 runtime bundle，不调用 preview/upload，不修改微信安装文件或 Windows 端口策略。

### 变动 23：开发者工具与真机验收清单

- 意图：明确哪些证据可以自动获得，哪些能力必须用真实设备确认。
- 决策：新增 `docs/微信开发者工具与真机验收清单.md`，分别记录自动化、触控、横竖屏、系统断网、存储错误、隐私和 TTS 状态。
- 理由：开发者工具不能替代真机；TTS adapter 已实现，但账号插件授权和真机实际发声仍必须分别验收，不能因按钮存在就判为通过。
- 证据：清单含设备信息、逐项通过标准、当前状态和一次性安全开关命令。
- 生效范围：issue #33/#65/#67/#68 的微信验收；不扩大当前 PoC 功能范围。

### 变动 24：真实 AppID 仅进入本机私有配置

- 意图：让新版微信开发者工具可以加载真实项目，同时避免把本机联调身份写进未来代码 PR。
- 决策：公共 `project.config.json` 保留 `touristappid`；真实 AppID 只写入被 `.gitignore` 排除的 `project.private.config.json`，AppSecret 不读取、不复制、不进入客户端。
- 理由：登录成功后开发者工具仍将游客占位值解析为空 AppID，导致基础库请求报 `appid missing`；私有配置优先覆盖公共配置，正好适合每位开发者的本地项目身份。
- 证据：CLI `islogin` 已返回 `true`；写入私有配置并用官方 CLI 明确关闭、重新打开项目后，`appid missing` 消失，首页 route、用户代码、webview 和截图均正常加载。
- 生效范围：当前电脑上的微信开发者工具联调；不改变 Taro runtime、CBoard core、服务端密钥管理或未来提交中的公共 AppID。

### 变动 25：官方开发者工具 Skill 优先

- 意图：让 Codex 使用微信官方、随开发者工具同步维护的自动化入口，停止长期维护脆弱的私有协议桥接和 Windows 端口补丁。
- 决策：下一轮在用户明确批准升级后，优先采用 Nightly Electron Build `2.02.2607032+` 自带的 `miniprogram-dev-skill` / `wechatide`；当前 `miniprogram-automator` 脚本暂时保留为诊断和兼容回退，不继续扩成自建框架。
- 理由：官方 Skill 覆盖状态、编译、模拟器、日志、导航、元素与页面操作并随开发者工具版本同步；当前 npm SDK 最新版仍为 `0.12.1`，本机实测原生小程序的 `Page.*` 查询与点击通过，而同一工具对 Taro 页面悬挂，继续堆超时无法消除版本/渲染协议风险。
- 证据：`weapp-dev-mcp` 项目已明确建议迁移至微信开发者工具 Skill，并给出 Nightly 最低版本；腾讯云开发者社区记录了内置 Skill 的状态检查和完整工作流；Windows 实践表明应通过 PowerShell 7 调用 `wechatide`，避免 MSYS 路径转换与中文编码问题。本机开发者工具仍为 `2.01.2510280`，尚无 `wechatide`，因此本轮没有擅自升级。
- 生效范围：后续 Codex 本地 UI 自动化策略；不改变小程序 runtime、业务逻辑或 CI，不自动执行 preview、upload、云资源写入或发布，也不在未获批准时替换当前开发者工具。

### 变动 26：官方开发者工具 Skill 完成接管

- 意图：解除旧 `miniprogram-automator` 在 Taro 页面 `Page.*` 协议处的阻塞，让 Agent 能直接操作并验证真实小程序页面。
- 决策：将开发者工具内置 `wechatide-skill 0.3.0` 整目录同步到 Codex，状态检查必须同时满足 `loginExpired: false` 与 `versionRelation: equal`；页面自动化改用官方 `wechatide`，旧脚本只保留兼容回退。
- 理由：官方 Skill 与当前开发者工具协议同步，已经提供项目开窗、页面编译、元素输入/点击、文本断言、截图和日志读取，不需要继续扩展私有协议桥接。
- 证据：官方状态检查返回版本相等且登录有效；项目列表只包含当前绝对路径；Taro 页的模式切换、输入、按钮点击、元素计数和文本读取均成功。
- 生效范围：当前工作站的 Codex 小程序自动化与验收；不改变小程序 runtime，不调用 preview、upload、云资源或发布接口。

### 变动 27：饮水复合词按动作和对象拆分

- 意图：避免“想喝水”只生成“我想要 / 喝”并错误宣称完整匹配，确保接收端保留“水”这一沟通对象。
- 决策：在共享纯核心的 `SPLIT_COMPOUNDS` 中加入“喝水”和“饮水”，回归测试走真实 `Intl.Segmenter` 路径，不再通过预先分词隐藏问题。
- 理由：部分中文分词器会把“喝水”视为一个词；该词又是“喝”图卡的同义词，若不先拆分，matcher 会消费整个词并丢失“水”图卡。
- 证据：CBoard segmentation、symbol matching、receiver pipeline 共 `3 suites / 30 tests` 通过；微信 receiver session 使用真实分词后仍为三张图；生产构建成功。
- 生效范围：CBoard Web 与微信小程序共同复用的接收端文字到图卡管线；不修改默认板数据、API、AI 或患者表达语义。

### 变动 28：接收端独立展示与本地恢复完成运行态验收

- 意图：证明“输入文字 → 逐词复核 → 独立全屏展示 → 保存历史 → 刷新恢复”不是仅在单测中成立，并回归旧版图片叠加问题。
- 决策：使用官方 Skill 在真实 Taro 模拟器中执行“想喝水”接收闭环，以元素文本、图卡数量、完整模拟器截图和刷新后历史作为通过证据。
- 理由：单元测试无法证明 WXML 事件、独立页面覆盖层、图片布局和微信 storage 恢复；这些必须在开发者工具运行态验证。
- 证据：逐词结果为“想→我想要、喝→喝、水→水”，质量为 `3/3`，预览和独立展示页均为三张图；截图未见原页面叠图；返回后及模拟器刷新后历史均为“想喝水”。
- 生效范围：微信接收端本地 E2E 和验收结论；患者端完整点击闭环与真机仍保持未验收，不扩大为全功能完成声明。

### 变动 29：旧 CLI 端口 shim 仅保留精确兼容

- 意图：让兼容回退脚本同时识别旧版与新版 CLI 的硬编码端口声明，避免开发者工具升级后回退诊断入口立即失效。
- 决策：只接受已知的 `let j=3799;` 与 `let D=3799;` 两个精确标记；匹配不到或出现歧义时失败关闭，不修改微信安装文件或系统端口配置。
- 理由：新版 CLI 仅改变了压缩变量名，直接扩大为宽泛正则会误改未知代码；显式白名单更安全、可审计，也符合该脚本只作回退的定位。
- 证据：`scripts/wechat-cli-port-shim.cjs` 的 Node 语法检查通过，旧/新标记均进入同一受控替换路径；官方 Skill 已成为主控制面。
- 生效范围：本地旧 CLI 自动化回退；不进入小程序 runtime bundle，不改变业务逻辑、开发者工具安装、Windows TCP 排除区间或安全设置。

### 变动 30：完整默认板生成与主包约束

- 意图：完整复用 CBoard 默认内容，同时保证微信主包可以直接安装和离线启动。
- 决策：生成脚本按源文件 hash 校验新鲜度，把所有图片统一压缩为 128 × 128 WebP，并在每次 build/dev 前执行 `check:boards`；生成物继续保留稳定 Board/Tile ID。
- 理由：手工挑图会持续偏离 CBoard；不做压缩则完整板资源无法可靠留在微信主包，运行时下载又会破坏离线核心。
- 证据：生成结果固定为 44 boards / 825 tiles / 775 images；默认 `dist` 为 794 files / 1,960,573 bytes，低于 2 MiB；生产构建只剩首页 JS 推荐体积警告，无构建错误。
- 生效范围：微信默认内容包和构建 gate；不改 CBoard 上游资源，不引入 CDN 或运行时网络依赖。

### 变动 31：TTS 纯核心与 Taro adapter 解耦

- 意图：让语音错误可被自动化验证，并避免单测导入整个 Taro DOM 运行时。
- 决策：`speechPort.ts` 只接受注入的插件、音频和计时依赖；`taroSpeechPort.ts` 才引用 Taro 和全局 `requirePlugin`。
- 理由：首轮测试在导入 Taro 时因 `ENABLE_INNER_HTML is not defined` 于用例前失败，证明平台装配不应位于纯端口工厂中。
- 证据：TTS 端口测试 `6/6` 通过，加入 ASR 后完整 Vitest `9 files / 36 tests` 通过，类型、Lint、边界扫描与生产构建均通过。
- 生效范围：微信语音平台层和测试边界；不改变 CBoard DTO、matcher、repository 或 Web TTS provider。

### 变动 32：插件授权与构建模式分离

- 意图：让未获插件授权的开发环境仍可使用双向沟通，同时为正式 AppID 保留真实发声路径。
- 决策：只有 `TARO_APP_WECHAT_SI_ENABLED=true` 时才向 `app.json` 写入 WechatSI；默认构建不声明插件，点击朗读显示账号配置提示。插件版验证后始终恢复默认构建。
- 理由：微信会在应用启动前校验插件授权；若默认强制声明，未授权账号会导致整个小程序无法打开，反而破坏离线沟通核心。
- 证据：默认 `app.json` 无 `plugins` 且模拟器正常；首次插件版因账号未授权被拒绝。账号管理员在“账号设置 → 第三方设置 → 插件管理”添加 WechatSI 后，插件版 production build、兼容语法检查和 `auto_preview` 均成功。
- 生效范围：微信构建配置、患者朗读、接收全屏播报及照护者语音输入；插件账号前置已完成，真实发声与录音识别仍由真机验收确认。
### 变动 33：照护者语音输入复用 WechatSI

- 意图：补齐原图语家“照护者说话 → 文字 → 图片序列”的接收端核心入口，而不是只保留手动打字。
- 决策：新增平台无关 `RecognitionPort` 和 `taroRecognitionPort`；WechatSI `getRecordRecognitionManager` 负责中间结果、最终结果、停止、取消、错误与超时，最终文字直接进入既有分词和图片匹配管线。接收页保留文字输入兜底，并为自动化入口设置稳定 ID。
- 理由：语音识别是原图语家 README 明确列出的核心功能；复用既有 matcher 可以避免语音路径另造一套语义逻辑。端口与 Taro 分离后可单测，未授权 AppID 也不会失去文字沟通能力。
- 证据：ASR `6/6` 单测和完整 `9 files / 35 tests` 通过；类型、ESLint、`32 app / 18 core` 边界及默认/插件 production build 通过。插件版 `app.json` 含 WechatSI 和 `scope.record` 用途说明；授权后语音按钮在模拟器中可启动/停止，插件版已成功推送真机预览。
- 生效范围：微信照护者接收模式、WechatSI 平台端口、录音权限说明和本地自动化选择器；不修改 CBoard matcher、Web Speech API、云端 ASR、登录或同步。真实录音识别仍需当前 AppID 获插件授权后在真机验收。

### 变动 34：插件授权、旧预览缓存与真机包收口

- 意图：在账号完成 WechatSI 授权后，把“能构建”推进到“能发到手机验收”，并防止开发者工具继续打包旧语法。
- 决策：公众平台按“账号设置 → 第三方设置 → 插件管理”添加插件，不要求先发布小程序；每次插件版重建后只清理 `cleanCompileCache` 与 `cleanProjectFileListCache`，再执行 `simulator_refresh` 和 `auto_preview`。
- 理由：首次预览错误仍引用磁盘上已不存在的 `z?.name`，证明阻塞来自开发者工具缓存；只清编译和文件列表缓存可保留登录、授权和本地沟通记录。
- 证据：磁盘产物兼容检查为 0 个 `?.` / `??`；定向缓存清理后两次 `auto_preview` 成功，最新包大小 628057 bytes；TypeScript、ESLint、`9 files / 35 tests` 和插件版 production build 通过。
- 生效范围：正式 AppID 的本地开发、插件版构建与手机预览；不上传体验版、不提交审核、不发布，也不把“预览推送成功”写成“真机语音已通过”。

### 变动 35：真机图卡 PNG 与透明空图修复

- 意图：修复手机端从“全部图片不显示”改善后仍有部分图卡不可见的问题，同时保持完整 CBoard 默认图库离线可用。
- 决策：默认图卡从 WebP 改为 96×96、32 色 PNG8，上传时强制包含整个图卡目录；对 SVG 先铺白底、移除透明通道再量化，并在构建前拒绝小于 200 字节的可疑空图。
- 理由：真机已证明 TTS 和分词正常，旧预览最初完全不显示图片；PNG 版让大部分图片恢复后，全量扫描发现“水、聊聊、厨房、叉子、刀、勺子”等线条 SVG 被压成 117 字节透明空图，根因是透明黑与线条黑在 PNG8 量化时合并。
- 证据：修复后 775 张图卡全部可解码且无小于 200 字节文件；“水”由 117 B 增至 1,157 B，“聊聊”增至 797 B，“叉子”增至 520 B；图卡资源 953,152 B，TypeScript、ESLint、边界检查、9 files / 35 tests、WechatSI production build 均通过，最新预览已成功推送。
- 生效范围：微信小程序完整默认图卡生成、构建门禁和手机预览；不修改 CBoard 源 SVG、共享 matcher、Web 图片资源、登录、云同步、AI 或编辑器。新预览的最终真机显示仍以用户复测为准。
- 记录：Codex（GPT-5），2026-07-17 18:23:32。

### 变动 36：图卡内容指纹阻断真机旧缓存

- 意图：解决本地白底 PNG 已正确、手机却仍显示同名旧空图的问题，保证图卡修复真正进入预览。
- 决策：图卡文件名不再只散列源路径，改为散列源 SVG 内容和 png8-white-v1 转换版本；源图或转换规则变化都会得到新 URL。
- 理由：用户在白底修复后的预览中仍看不到刀具、勺子、分叉和碗，而本地逐张读取均清晰可见；两次预览包大小完全相同，说明同名资源缓存仍在生效。
- 证据：水、分叉、刀具、勺子和碗分别获得全新路径，旧路径已从资源目录删除；门禁、9 files / 35 tests 和 production build 通过；指纹版 auto_preview 成功且包大小从 1,562,990 B 变为 1,580,386 B。
- 生效范围：微信图卡生成文件名、生成 manifest、预览缓存隔离；不改变 BoardDTO/TileDTO、图片语义、CBoard 原 SVG、matcher 或 Web。最终真机显示仍等待用户打开最新预览确认。
- 记录：Codex（GPT-5），2026-07-17 18:23:32。

### 变动 37：跨端短语保护与人工重分词闭环

- 意图：恢复图语家“机器识别和自动分词只是草稿，照护者可以修改文字、修正分词后再匹配图片”的接收端原则，并消除微信无 `Intl.Segmenter` 时逐字切分的退化。
- 决策：CBoard 共享核心改为“高风险短语/中文词典最长匹配优先，`Intl.Segmenter` 只处理剩余文本”，保护“不开心、上厕所、肚子疼、头晕、吃药、打电话、开心果、苹果手机”等语义，同时继续把“想喝水、想吃苹果”拆成动作与对象；微信接收页新增可编辑分词框，使用 `/`、空格或中文分隔符拆词/合词并通过 `preSegmented` 重新匹配，修改前后写入 `resegment` 纠错日志。
- 理由：原图语家研究与高风险清单已经要求“先保护短语，再普通分词”，但旧自动分词代码和迁移测试只覆盖少量合并词；算法无法保证永远正确，因此人工修正必须与自动优化同时存在，并且两端必须复用同一纯核心。
- 证据：CBoard Communication Support `26 suites / 143 tests` 全部通过，其中分词、matcher、纠错定向为 `3 suites / 53 tests`；微信 TypeScript、ESLint、`9 files / 36 tests`、`32 app / 18 core` 边界、44 boards / 825 tiles / 775 images 和 WechatSI production build 通过。官方模拟器输入“我不开心想上厕所”得到 `我 / 不开心 / 想 / 上厕所`，再人工改为 `我 / 不开心 / 想 / 上 / 厕所` 后五个词的图卡序列即时重建；新 `auto_preview` 成功，包大小 1,551,956 B。
- 生效范围：CBoard Web 与微信共同复用的中文分词、接收 matcher、纠错证据，以及微信照护者接收 UI；不引入 jieba、云端 AI、登录或同步，不自动猜测未匹配词的图片，也不宣称人工修正已覆盖 CBoard Web UI。
- 记录：Codex（GPT-5），2026-07-17 19:52:02。

### 变动 38：患者个人熟悉图片的本机私有覆盖

- 意图：落实图语家“优先使用患者熟悉图片”的既有决策，同时继续完整复用 CBoard 默认板，不为微信另建第二套公开图库。
- 决策：共享核心以稳定 Board/Tile ID、患者身份和工作区身份保存个人图片覆盖；Web 复用 CBoard 图片输入与压缩，微信复用 `chooseMedia`、`saveFile` 和 `removeSavedFile`。覆盖只改变显示图，不修改原始 CBoard Tile，也不进入 Settings、沟通事件或云同步。
- 理由：患者熟悉的人、物和场景通常比通用图符更容易理解，但家庭照片属于高敏感数据；显示层覆盖既保留默认板完整性，也能在删除个人图片后立即回退默认图卡。
- 证据：共享核心和 repository schema v3 已覆盖身份隔离、独立 storage key、保存、删除、回退与未来版本保护；微信完整回归 `19 files / 72 tests`、TypeScript、ESLint、`65 app / 18 core` 边界和 production build 通过，官方模拟器可定位“个人图片”入口。
- 生效范围：CBoard Web、微信小程序、当前设备和当前患者/工作区；不上传家庭照片，不修改公开板，不把本机文件路径同步到账号或 API。真实手机选择、替换和删除照片仍需真机验收。
- 记录：Codex（GPT-5），2026-07-18 10:30:16。

### 变动 39：正式插件声明固定与预览模式漂移修复

- 意图：修复已授权且曾真机成功发声后，后续预览又提示“尚未启用微信语音插件”的回退。
- 决策：正式 AppID 已完成 WechatSI 授权后，`app.config.ts` 对所有微信构建固定声明 WechatSI `0.3.4` 和 `scope.record`，不再由仅存在于 `.env.production` 的开关决定是否声明插件。
- 理由：开发者工具或 watch 构建会加载 `.env.development`；旧条件配置会重新生成不含插件的 `app.json`，使后续预览包在同一 AppID 下发生功能漂移。账号授权前的条件开关已完成历史使命，继续保留反而制造回归。
- 证据：生产产物 `dist/app.json` 含 provider `wx069ba97219f66d99` 和录音权限；官方模拟器运行时 `requirePlugin('WechatSI')` 成功，TTS/ASR 方法均存在；紧急页有 `8` 个图片节点、`0` 个缺图提示；`19 files / 72 tests`、类型、Lint、边界和 production build 通过，`auto_preview` 成功推送 `1,690,501` 字节新包。
- 生效范围：正式“图语家”AppID 的开发、生产构建、患者朗读、照护者语音输入和手机预览；不代表 Azure OpenAI 已配置，不上传体验版、不提交审核、不发布。手机最终发声和图片显示仍以本次新预览复测为准。
- 记录：Codex（GPT-5），2026-07-18 10:30:16。

### 变动 40：真实照护话术首批高风险回归

- 意图：把原图语家已经整理的真实照护话术从文档证据迁成可重复执行的跨端回归，防止分词和匹配优化在后续开发中重新退化。
- 决策：首批选取 15 条医疗、安全和基本照护高风险话术作为共享 matcher 永久测试；CBoard 默认板已有概念必须准确或通过受控同义词命中，默认板没有安全图卡的词必须完整保留为未匹配，禁止用部分匹配猜图。
- 理由：匹配率不是唯一目标；在“厕所、头晕、不舒服、危险、停下来”等概念缺图时，错误猜图比明确提示照护者补图更危险。真实样本还暴露了“吃药”“量血压”“痛不痛”三个此前演示用例没有覆盖的退化点。
- 证据：新增真实话术回归后，CBoard `receiverCaregiverFixtures`、segmentation、symbol matching 共 `3 suites / 69 tests` 通过；微信继续通过 `19 files / 72 tests`、TypeScript、ESLint、`65 app / 18 core` 边界和 production build。官方模拟器实测“吃药”命中“药”同义词图、“量血压”命中“血压”同义词图、“痛不痛”分为 `你 / 现在 / 痛 / 不 / 痛`，第一处“痛”命中疼痛图，否定短语不被错误重复画成疼痛；Console 对 error/fail/plugin 检索为空。
- 生效范围：CBoard Web 与微信共同复用的中文分词和图文匹配纯核心；不新增默认板图卡，不把“厕所”等缺图概念错误映射到卫生纸，也不代表在线补图或 AI 服务已经部署。
- 记录：Codex（GPT-5），2026-07-18 11:17:51。

### 变动 41：日常照护与体位话术扩展

- 意图：继续把原图语家真实样本迁入共享回归，覆盖换尿片、洗澡、刷牙、换衣服、睡觉、休息、灯光、坐起、躺下、枕头和被子等高频照护场景。
- 决策：新增 13 条日常照护/体位样本，使永久回归达到 28 条；`尿片、衣服、枕头、被子、盖上、关掉` 在有无 `Intl.Segmenter` 时都保留词义，`换衣服` 明确拆成“换 / 衣服”，重复出现的“衣服”必须保留两次。
- 理由：微信运行时可能没有 `Intl.Segmenter`，逐字退化会让照护者看到“尿 / 片”“盖 / 上”；把“换衣服”保留成单一复合词又会吞掉动作和第二个衣物对象，无法忠实表达原句。
- 证据：新增样本基线真实暴露 3 个退化；修复后 CBoard fixture、segmentation、symbol matching 为 `3 suites / 92 tests`，微信为 `19 files / 72 tests`，TypeScript、ESLint、`65 app / 18 core` 边界和 production build 均通过。官方模拟器在定向清理编译缓存后得到 `现在 / 要 / 换 / 尿片`、`衣服 / 湿 / 要 / 换 / 衣服`、`被子 / 要不要 / 盖上`，Console 无 error/fail；最新预览 `1,690,916` 字节推送成功。
- 生效范围：CBoard Web 与微信共享分词/matcher、微信接收端和测试门；不新增或猜测尿片、被子等默认图卡，缺图继续进入照护者维护队列。
- 记录：Codex（GPT-5），2026-07-18 11:29:30。

### 变动 42：原图语家 80 条证据话术完整迁移

- 意图：完成“文档 / issue → 原实现 → CBoard Web → 微信小程序”覆盖矩阵中 #38/#15 的样本迁移，不再让剩余话术只停留在原仓库文档里。
- 决策：把 `receiver-fixture-samples-evidence.md` 的 80 条照护话术全部纳入共享永久回归；已知 CBoard 概念验证图卡键，关键词验证词界和重复次数，所有样本禁止未受控 partial 猜图。`不回家` 保留为完整否定单元，避免误画成肯定“回家”。
- 理由：抽样通过不能证明其余场景没有退化；全量基线又发现很痛、冷不冷、热不热、帮你、坐车、看你、家里人和画画等词界问题，证明完整迁移是必要的。
- 证据：首轮全量基线 `70/80`，修复 10 个差异后，CBoard fixture、segmentation、symbol matching 为 `3 suites / 160 tests`；微信 `19 files / 72 tests`、TypeScript、ESLint、`65 app / 18 core` 边界和 production build 通过。官方模拟器确认 `冷 / 不冷`、`我 / 帮你 / 叫 / 护士 / 好`、`今晚 / 不回家 / 吃 / 饭`、`要不要 / 给 / 家人 / 发消息`，Console 无 error/fail；最新预览 `1,691,223` 字节推送成功。
- 生效范围：CBoard Web 与微信共享分词/matcher、80 条证据 fixture 和微信接收端；不把 fixture 直接变成用户词库，不新增默认图卡，不代表缺图词已经有图片或 AI 已部署。
- 记录：Codex（GPT-5），2026-07-18 11:39:32。

### 变动 43：语音识别中的独立波形反馈

- 意图：补齐原图语家 issue #16 的可见识别反馈，让照护者在按下语音输入后能立即确认小程序正在听，而不只依赖按钮文字变化。
- 决策：在微信接收端识别状态为 `isListening` 时显示独立状态区、7 根错峰动画波形和“识别后仍可人工修改”说明；识别结束后整个状态区从页面移除。
- 理由：微信插件当前适配器不提供原始音频帧振幅，伪装成真实音量波形会误导用户；用识别生命周期驱动的动画既能提供明确反馈，也不改变 ASR、人工修正或双向沟通管线。
- 证据：TypeScript、ESLint、Vitest `19 files / 72 tests`、`65 app / 18 core` 边界和 production build 通过。官方模拟器开始识别时查询到 1 个 `#receiver-listening-feedback` 与 7 个 `.listening-feedback__bar`，结束后状态节点为 0，按钮恢复“语音输入”，Console 无 error/fail；`auto_preview` 成功推送 `1,693,589` 字节。
- 生效范围：仅微信小程序照护者接收端的识别中视觉反馈；不采集、不保存音频，不声称反映真实音量，也不改变 WechatSI 插件授权和正式 AppID 要求。
- 记录：Codex（GPT-5），2026-07-18 11:49:29。

### 变动 44：最新手机预览语音链复测通过

- 意图：把手机端实际结果与模拟器证据分开记录，确认正式 AppID 和 WechatSI 插件链已经在最新预览恢复。
- 决策：将照护者语音输入（ASR）和患者端朗读（TTS）标记为本轮真机已确认；波形、紧急图片和个人图片继续保持待验收，不从语音结果外推。
- 理由：插件方法存在、构建成功和模拟器按钮可操作都不能替代手机麦克风与扬声器的真实结果；同时也不能用语音成功证明图片资源正常。
- 证据：用户在 `1,693,589` 字节最新手机预览中明确反馈“语音输入以及播报都恢复正常了”。
- 生效范围：微信小程序最新预览的 ASR/TTS 真机验收状态；不代表 AI 服务、在线补图、波形视觉、紧急图片或个人图片已经验收。
- 记录：Codex（GPT-5），2026-07-18 11:52:55。

### 变动 45：波形从持续动画改为语音活动反馈

- 意图：修复“无论有没有说话波形都在动”的误导，让静音与收到识别片段两种状态可以区分。
- 决策：监听开始后保留静止的 7 柱反馈；只有 WechatSI `onRecognize` 返回新的增量文字时才活动 900 毫秒，后续片段会续期；停止、取消、超时和重新输入都立即静止或卸载。
- 理由：WechatSI 当前接口只提供增量识别文字，没有原始音频振幅；同时启动第二个录音器会与插件争用麦克风。用真实插件事件驱动比永久 CSS 动画诚实，也比伪造分贝更安全。
- 证据：用户真机发现旧版静音时仍持续动画；修正后 TypeScript、ESLint、Vitest `19 files / 72 tests`、`65 app / 18 core` 边界和 production build 通过。官方模拟器开始监听时反馈区为 1、活动类为 0，停止后反馈区为 0，Console 无 error/fail；新逻辑已进入并推送 `1,693,589` 字节预览。
- 生效范围：微信照护者接收端语音活动视觉；静音静止已有模拟器证据，真机说话时随 `onRecognize` 活动仍待复测；不是原始音频振幅图。
- 记录：Codex（GPT-5），2026-07-18 12:02:28。

### 变动 46：缺词自动联网补图的 ARASAAC 备用通道

- 意图：在没有公开部署 `cboard-api` 时恢复“缺词自动上网找图”，同时不让网络增强阻断本地沟通。
- 决策：有 `TARO_APP_API_BASE_URL` 时继续优先复用 CBoard API；没有时只把单个缺词发送到 ARASAAC 中文搜索。设备设置默认开启且可关闭，候选必须由照护者确认，缓存只接受 ARASAAC 规范图片地址和数字来源 ID。
- 理由：此前 UI 和 API port 已存在，但手机没有可访问的后端地址，功能实际上不可用；直连公开图符提供方可以减少部署前置，同时保留最小披露、人工确认、来源许可和 SSRF 防护。
- 证据：实网只读验证“厕所”返回 ARASAAC `37331/37710`、“头晕”返回 `7155`，规范 PNG 返回 HTTP 200；CBoard 偏好测试 `1 suite / 3 tests`，微信 TypeScript、ESLint、Vitest `20 files / 77 tests`、`67 app / 18 core` 边界和 production build 通过。官方模拟器验证开关关闭后刷新仍保持关闭、恢复开启后缺词会自动触发；当前账号尚未配置 ARASAAC 合法域名，因此真实候选和缓存仍待手机验收。
- 生效范围：微信缺词队列、通信偏好和 ARASAAC 备用 port；不是 AI，不自动采用图片，不上传整句、历史、语音或个人图片。
- 记录：Codex（GPT-5），2026-07-18 13:12:52。

公众平台配置路径：`开发管理 → 开发设置 → 服务器域名`。

- `request 合法域名`：`https://api.arasaac.org`
- `downloadFile 合法域名`：`https://static.arasaac.org`

### 变动 47：去除重复回调与无限识别动画

- 意图：彻底修复手机端再次观察到的“无论有没有说话，下面的波形都在动”。
- 决策：空白或与上次完全相同的 `onRecognize` 结果不再触发 UI；每个真正变化的增量文字只播放一次 300 毫秒活动脉冲，420 毫秒后恢复静止；录音按钮取消常驻呼吸动画。
- 理由：WechatSI 不提供原始振幅，900 毫秒无限循环并续期仍可能被插件重复结果维持，看起来像虚假的实时音量。有限单次脉冲只表达“识别文字刚刚更新”，静音时没有任何运动。
- 证据：识别适配器回归新增重复文字、空白和新文字序列，微信 Vitest `20 files / 77 tests` 全通过；TypeScript、ESLint、`67 app / 18 core`、production build 通过。构建产物已移除 `receiver-waveform`、`receiver-listening-pulse` 和 `infinite` 语音动画；官方模拟器监听静音 2 秒后仍为 `1 feedback / 0 active`，最新 `1,698,996` B 预览推送成功。
- 生效范围：微信照护者接收端和 WechatSI 增量回调；它是识别活动提示，不是实时振幅图，不改变已经真机通过的 ASR/TTS，也不启动第二个录音器。
- 记录：Codex（GPT-5），2026-07-18 13:12:52。

### 变动 48：餐具自然中文匹配与开发者工具缓存复核

- 意图：修复用户输入“叉子、刀、勺子、碗”时部分图片缺失，并区分图卡资源损坏、文字匹配失败和开发者工具旧缓存三种原因。
- 决策：不修改 CBoard 上游原始翻译，在共享概念 profile 中把 `fork/knife/spoon/bowl` 校准为“叉子/刀/勺子/碗”，保留“分叉、餐叉、叉、刀具、餐刀、勺、汤匙、饭碗”等受控同义词；微信 BoardDTO 同时校准显示文字与朗读文字。验证新版产物时只定向清理开发者工具编译缓存和项目文件列表缓存，不清除登录、插件授权或业务 storage。
- 理由：CBoard 默认中文把 fork 译为“分叉”、knife 译为“刀具”、bowl 误译为“弓箭手”，因此自然输入最初只有勺子和碗产生图片节点；PNG 文件本身完整可见。修复后开发者工具仍短暂显示旧结果，证明产物问题与 IDE 编译缓存需要分别诊断。
- 证据：修复前官方模拟器输入“叉子 刀 勺子 碗”只有 `2/4` 个复核图片节点；修复并定向清理缓存后为 `4/4`，截图肉眼确认四张餐具图和四个“准确匹配”。CBoard fixture/segmentation/matcher 为 `3 suites / 161 tests`，微信 Vitest 为 `20 files / 78 tests`；TypeScript、ESLint、`67 app / 18 core`、production build 均通过，Console 无 error/fail，最新 `1,699,897` B 预览已推送。
- 生效范围：CBoard Web 与微信共享 matcher、微信 BoardDTO 显示/朗读、餐具接收结果和验收流程；不修改 CBoard 原始翻译文件，不把模拟器图片通过写成手机真机通过。
- 记录：Codex（GPT-5），2026-07-18 13:41:01。

### 变动 49：新对话清草稿但保留历史的刷新闭环

- 意图：完成微信验收清单中一直待运行的“新对话后再次重启”，证明重置当前工作区不会误删旧双向沟通历史。
- 决策：以已有接收草稿“叉子 刀 勺子 碗”和设备历史 5 条为基线，点击“新对话”后分别检查提示、接收输入和历史数量，再刷新模拟器、重新进入接收模式并复查；最后打开“全部历史”读取实际分组内容。
- 理由：只看到“新对话已开始”不能证明 repository 已正确持久化；只比较历史数量也不能证明记录仍可读取。草稿清空、刷新后仍为空、数量不变和实际历史正文可见必须同时成立。
- 证据：点击前 `#receiver-input` 为“叉子 刀 勺子 碗”、历史为 5 条；点击后提示“新对话已开始，原有历史仍会保留。”，输入立即为空且历史仍为 5 条。模拟器刷新并重新进入接收模式后输入仍为空、历史仍为 5 条；“全部历史”可读到 4 个会话分组中的表达与接收正文，Console 无 error/fail。
- 生效范围：微信 storage、活动会话、接收草稿和历史管理器的官方模拟器验收；不等同于手机杀进程、系统清理 storage 或多设备并发验收。
- 记录：Codex（GPT-5），2026-07-18 13:51:48。

### 变动 50：移除延迟波形，改为即时静态监听状态

- 意图：响应真机“静音时已静止、说话时会活动，但延迟较高”的反馈，避免把 WechatSI 延迟返回的文字事件继续表现成实时音量。
- 决策：彻底删除 7 柱波形、柱形节点、关键帧和所有语音运动；录音开始立即显示不会运动的“监听中”状态牌。只有收到新的、不重复的增量文字时，状态牌短暂变色并显示“已更新”，上方识别文字仍即时可编辑。
- 理由：当前 WechatSI manager 只提供 `onRecognize` 文字回调，回调时机由插件决定，没有原始振幅；另启 `RecorderManager` 读取帧需要自己占用录音器并设置 `frameSize`，会与已经真机正常的 ASR 麦克风链冲突。延迟无法由 CSS 缩短，但可以不再把它伪装成实时波形。
- 证据：用户确认上一预览“静音时静止、说话时活动，但延迟有点高”；源码和生产产物已不存在 `listening-feedback__wave`、`listening-feedback__bar`、`receiver-recognition-activity` 或语音无限动画。TypeScript、ESLint、Vitest `20 files / 78 tests`、`67 app / 18 core`、production build 均通过；官方模拟器录音开始即读取到“监听中”和“这是监听状态，不是音量波形；静音时不会变化”，截图肉眼确认静态状态牌，Console 无 error/fail，最新 `1,699,175` B 预览已推送。
- 生效范围：微信照护者语音输入视觉反馈；不改变 WechatSI ASR/TTS、录音权限、识别文字或人工修正，不声称提供真实振幅，也不启动第二录音器。
- 记录：Codex（GPT-5），2026-07-18 14:12:14。

### 变动 51：本地图卡安全消解过期缺词并显示真实全量

- 意图：图卡匹配规则改进后，自动清理已经能由 CBoard 本地图卡安全解决的旧缺词，避免继续触发在线搜索；同时修复队列超过 20 条时总数永远显示“待处理 20”的误导。
- 决策：共享核心只对带图片、精确标签或受控同义词命中的记录自动消解；多个 Tile 只有在非空 `labelKey` 完全相同时才视为同一概念，否则继续等待照护者确认。自动结果标记为 `source: catalog-auto` 与 `reviewedByCaregiver: false`。Web 和微信都按全部记录计算待处理总数，展示列表仍限制 20 条；本地自动解决摘要与在线搜索状态分别显示，不再互相覆盖。
- 理由：真实微信 storage 已有“叉子、刀、痛”等旧缺词，而当前 matcher 已能安全命中这些图卡；继续显示待处理并发送网络请求既增加照护者负担，也浪费最小披露边界。原 UI 对截取后的 20 条计数，无法反映真实队列变化。
- 证据：真实 storage 中“叉子、刀、痛”已变为 `resolved / catalog-auto / reviewedByCaregiver=false`，“头晕”仍为 `new`。官方模拟器显示真实“待处理 26”“本机 CBoard 已自动解决 3 个过期缺图词”和 ARASAAC 合法域名提示，截图中“头晕”仍待处理；Console 的 error/fail 检索为空。CBoard 相关回归 `6 suites / 179 tests`，微信 TypeScript、ESLint、Vitest `20 files / 78 tests`、`67 app / 18 core` 边界及 production build 均通过；新 `auto_preview` 为 `1,701,030` 字节。
- 生效范围：CBoard Web 与微信共享缺词核心、两端缺图维护 UI、微信 storage 和在线搜索候选集合；不放宽歧义匹配，不自动采用网络图片，不改变 ARASAAC 合法域名与照护者确认要求。
- 记录：Codex（GPT-5），2026-07-18 14:52:04。

### 变动 52：患者首屏图卡优先与独立接收页

- 意图：落实患者侧“图标优先、核心操作不超过三步”，避免说明卡和照护管理按钮占满首屏，也避免接收端继续与患者图板堆叠在同一页面。
- 决策：移除常驻宣传说明；首屏固定为模式入口、紧急/照护入口和步骤 01 图板，照护工具默认折叠。患者流程明确为“01 点图片、02 选候选、03 朗读或保存”；接收理解改为独立微信分包页面，返回时通过一次性 storage 意图打开紧急页或照护工具。
- 理由：患者必须不滚动就看到可点击图卡；照护者功能需要保留但不应成为患者主任务的视觉障碍。独立页面同时解决 UI 堆叠并为后续包体优化提供清晰装载边界。
- 证据：官方模拟器首屏无 `.hero`、照护面板默认不存在、29 张根板图卡节点可直接读取；截图可见“是 / 不 / 聊聊 / 时间 / 食物 / 饮品”。点“是”形成表达词条后可撤回；点击接收入口进入独立页并出现 `#receiver-input`。接收页点击紧急求助后返回并打开紧急页，8 张图片节点齐全；点击照护工具后返回并自动展开面板，Console 无 error/fail。
- 生效范围：微信患者首页、接收分包页和跨页导航；不改变 CBoard Web UI，不把模拟器证据写成手机触控、横竖屏或真机全图验收。
- 记录：Codex（GPT-5），2026-07-18 15:43:46。

### 变动 53：微信官方性能门禁与完整沟通分包

- 意图：把微信官方性能指南中的包体、媒体、插件、压缩、无依赖文件和组件按需注入要求变成持续门禁，避免继续加功能后逼近 2 MiB 才返工。
- 决策：团队配置固定开启 JS/WXSS/WXML 上传压缩、开发/上传无依赖过滤和 `lazyCodeLoading: requiredComponents`；本机开启自动体验评分且禁止跳过代码质量或放宽大包限制。构建脚本逐包检查 2 MiB 硬上限、1.5 MiB 建议线、200 KiB 媒体、未引用插件、未使用组件、旧语法和完整图卡。主包只保留轻量启动页，患者页、接收页及 775 张离线图卡全部放入 `/packages/caregiver/` 沟通分包。
- 理由：WechatSI 插件计入主包；首次仅拆接收页后，开发者工具仍报告主包 `1,968,857 B`，离 2 MiB 只剩很小余量。牺牲离线图卡或压坏图片不可接受，完整沟通分包能同时保留离线能力和增长空间。
- 证据：分包前最新预览约 `1,701,030 B`；首次不完整分包为总计 `2,005,385 B`、主包 `1,968,857 B`。最终生产构建证明未压缩主包 `292,760 B`、沟通分包 `1,388,411 B`，775 张 CBoard PNG 共 `953,152 B`、3 张紧急图均完整且无单媒体超过 200 KiB。开发者工具最终预览为总计 `1,681,076 B`、主包 `318,307 B`、沟通分包 `1,362,769 B`；TypeScript、ESLint、Vitest `21 files / 81 tests`、`74 app / 18 core` 边界和 production build 全部通过。
- 生效范围：微信项目配置、启动页、患者/接收分包、离线图片路径、构建和预览门禁；不改 CBoard 原图，不引入 CDN 依赖，不发布体验版或正式版。依据为微信官方《小程序性能优化指南》原文。
- 记录：Codex（GPT-5），2026-07-18 15:43:46。

### 变动 54：接收端五类纠错与“后加图片”

- 意图：补齐照护者复核图片序列时缺失的人工插入能力，并让替换、删除、排序、插入和重分词都留下可重放的本地证据。
- 决策：直接复用 CBoard 共享 `insertReceiverReviewItem` 与 `buildReceiverCorrectionFromEdit`；微信逐词操作新增“后加图片”，候选继续使用默认板和分类导航。新增图片标记 `manual`，替换图片标记 `corrected`，事件保存完整前后图片 ID 数组。
- 理由：小程序不应复制另一套纠错算法；共享纯核心能保证 Web 与微信行为一致。单个图片 ID 无法还原排序或插入位置，完整序列才能供审计；学习评分尚未设计，因此本轮不消费纠错日志。
- 证据：微信 `21 files / 82 tests`、TypeScript、ESLint、`74 app / 18 core` 边界与 production build 通过；44 boards / 825 tiles / 775 images 完整。未压缩主包 `292,760 B`、沟通分包 `1,389,749 B`；官方预览推送成功，总计 `1,681,074 B`、主包 `318,305 B`、沟通分包 `1,362,769 B`。开发者工具当前窗口因旧页栈缓存仍显示构建前模板，未清空用户本地数据，新入口等待最新手机预览触控复测。
- 生效范围：微信接收分包、共享接收纯核心、TypeScript 契约和本地 correction repository；不新增插件、网络依赖、API、云同步或发布，不改变患者主流程。
- 记录：Codex（GPT-5），2026-07-18 16:54:12。

### 变动 55：同一工作区记住人工换图和删除

- 意图：让照护者对图片序列的人工修正改善下一次相同词语的匹配，同时保持图语家“不跨家庭、不全局学习、可关闭”的隐私边界。
- 决策：微信直接消费 CBoard 共享 `correctionMemory.js`；从本机 correction 日志按 `workspaceId` 派生覆盖规则。最新换图立即优先，删除图卡在 90 天内不再自动出现；30 天半衰期只用于记录评分。接收复核区新增原生 Switch，默认记忆，关闭后本次日志仍可审计但不进入学习。
- 理由：复用共享纯核心可防止 Web 与微信形成两套纠错算法；从日志派生无需新增数据库或网络请求，也不会修改 CBoard 默认词典。只学习 replace/delete 可避免把人工插图、调序和分词误解成稳定词义。
- 证据：微信定向 receiver session `10/10`、全量 `21 files / 83 tests`、TypeScript、ESLint、边界和 production build 通过；未压缩主包 `293,081 B`、沟通分包 `1,394,484 B`。官方 `auto_preview` 成功推送总计 `1,682,631 B`，其中主包 `318,619 B`、沟通分包 `1,364,012 B`。
- 生效范围：微信接收分包、共享 matcher/receiver lifecycle、微信 storage 和 AI 重分词结果；不新增插件、网络、云同步、全局词典或发布。开发者工具模拟器仍受旧模板缓存影响，新开关等待最新手机预览触控复测。
- 记录：Codex（GPT-5），2026-07-18 17:42:58。

### 变动 56：人工删除高于自动补图的统一优先级

- 意图：修复照护者删除“喝”图卡后，下次生成仍被本机缺词自动消解恢复同一图片的问题，并证明换图、删除、关闭学习和双向历史在官方微信运行时形成闭环。
- 决策：共享核心在应用缺词解决记录前统一检查 workspace correction memory。`catalog-auto` 永远不能覆盖同一词图 tombstone；删除前的旧人工确认也不能覆盖较新的删除；只有删除后再次明确确认，或选择不同图片，才能恢复。微信初次生成和异步 `refreshReceiverMissingItems` 都复用同一过滤规则。
- 理由：matcher 和 repository 单独测试均正确，真实冲突发生在“人工删除 → 记录缺词 → 本机目录自动解决 → 异步填回图片”的组合顺序。只在微信 UI 隐藏图片会让 Web 与小程序继续分叉，也无法表达后来人工确认应覆盖旧删除的时间语义。
- 证据：官方 Skill E2E 精确确认删除、持久化和重匹配图卡 ID 均为 `ryctMA9amqtZ`，workspace 与时间戳有效，memory probe 为 2 条规则 / 1 个 tombstone。修复后首次重匹配直接显示“尚未匹配图片”，随后“关闭学习不污染后续匹配”、同会话双向历史、新对话保留旧历史和 Console 无 error 全部通过；原 13 项微信 storage 逐项恢复。CBoard 相关回归为 `48 suites / 342 tests / 1 snapshot`，微信为 `21 files / 85 tests`；TypeScript、ESLint、`74 app / 18 core`、CBoard production build 和 Taro production build 均通过。当前未压缩主包 `293,081 B`、沟通分包 `1,395,574 B`，继续低于微信官方 1.5 MiB 建议线。
- 生效范围：CBoard Web 与微信共享接收管线、缺词解决优先级、微信异步刷新、官方 Skill E2E 和验收文档；不跨 workspace，不上传 correction，不修改默认 CBoard 词典。本轮新 `auto_preview` 因安全审查要求用户再次明确授权而未上传，不能把本地产物冒充手机最新预览。
- 记录：Codex（GPT-5），2026-07-18 20:07:36。

### 变动 57：恢复 OpenAI-compatible AI 配置与两端健康检测

- 意图：恢复原图语家已经验证过的通用 AI 提供方配置，使 CBoard Web 与微信照护者能够区分“没有 API 地址”“未登录”“服务端未配置模型”和“服务可用”，而不是只看到不可操作的“AI 服务尚未配置”。
- 决策：`cboard-api` 优先读取服务端 `AI_API_KEY / AI_BASE_URL / AI_MODEL / AI_REQUEST_TIMEOUT_MS`，未配置时兼容原有 Azure OpenAI；默认超时 15 秒、最多重试 1 次。健康接口只返回 configured、provider、model 和 baseUrl，不返回密钥。CBoard Web 与微信复用同一认证健康接口；AI 仍只生成候选句或重分词建议，失败时继续使用本地规则。
- 理由：原图语家使用 OpenAI-compatible 配置，而既有 `cboard-api` 仅支持 Azure，导致已有提供方无法迁移；同时 `cboard-ai-engine` 面向整板/图符建议生成，不适合接管实时双向沟通状态机。服务端密钥与明确健康状态能够兼顾可操作性、最小披露和离线安全。
- 证据：`cboard-api` 提供方、控制器、请求参数、路由和图符代理定向回归 `19 passing`；完整 controllers 集成测试因本机未运行 MongoDB 为 `31 passing / 3 pending / 39 failing`，失败均为既有数据库依赖，未冒充全绿。CBoard 为 `48 suites / 343 tests / 1 snapshot`，production build 生成 `977 resources / 41.2 MB` Service Worker。微信 TypeScript、ESLint、Vitest `21 files / 86 tests`、`74 app / 18 core` 边界和 production build 通过；未压缩主包 `293,081 B`、沟通分包 `1,397,537 B`，均低于微信官方 1.5 MiB 建议线。官方模拟器读取到“尚未配置手机可访问的 HTTPS cboard-api。”，点击检测后为“AI 服务尚未配置，已继续使用本地规则。”，Console 无 error/fail。
- 生效范围：`cboard-api` AI 提供方配置、CBoard Web Communication Support 设置、微信照护设置、候选句和 AI 重分词调用；不包含公开 HTTPS 部署、登录令牌、真实提供方密钥或真实上游 AI 请求。本轮未执行 `auto_preview`、体验版上传或发布，手机仍是上一预览。
- 记录：Codex（GPT-5），2026-07-18 20:40:35。

### 变动 58：修正记忆可视化、撤销与跨端运行闭环

- 意图：让照护者看见当前工作区真正生效的换图/删除规则，并能撤销错误学习，而不是只能依赖不可见的 correction 日志。
- 决策：Web 与微信都直接消费共享 `correctionMemory.js`，按词显示偏好图、阻止图、确认次数和时间；“不再记住”只把相同 workspace/token 的 replace/delete 记录改为 `isUsedForLearning: false`，保留原始审计。微信入口仅位于独立接收页并默认折叠；Web 入口位于“常用语、历史、个人图片与修正记忆”。Web 管理目录使用与接收端相同的个性化/可见板，并传入 `intl` 解析只有 `labelKey` 的默认 CBoard 图块。
- 理由：删除审计会破坏问题追溯，修改默认词典又会跨家庭污染；此前生产 E2E 显示“偏好图：HJVQMR9pX5F-”，证明规则已生效但管理界面缺少国际化目录，必须修复数据边界而不能放宽断言。
- 证据：共享/Web 定向 `3 suites / 27 tests`，既定 CBoard 沟通门 `49 suites / 349 tests / 2 snapshots`，production build 与桌面/Pixel 5 离线 E2E `2 passed`；E2E 确认“偏好图：是”、停用后规则消失、审计行仍存在且 `isUsedForLearning: false`、再次生成恢复本地图。微信 Vitest `22 files / 87 tests`、TypeScript、ESLint、`76 app / 18 core`、production build 和官方 Skill E2E 通过；原 storage 在 finally 中完整恢复。未压缩主包 `293,081 B`、沟通分包 `1,402,290 B`，继续低于官方 1.5 MiB 建议线。
- 生效范围：CBoard Web 与微信照护者管理 UI、共享 correction memory/repository 和离线自动化；不删除纠错审计，不跨 workspace，不上传学习规则，不修改默认 Board/Tile。本轮未执行 `auto_preview`、体验版上传或发布。
- 记录：Codex（GPT-5），2026-07-18 21:31:42。

### 变动 59：“后加图片”官方运行态闭环

- 意图：把接收端人工插图从纯核心、单测和生产编译证据推进到微信开发者工具真实 UI/storage 闭环。
- 决策：官方 Skill E2E 在关闭学习后生成有稳定 CBoard 图卡的“想”，点击“后加图片”，从默认板选择“是”；同时断言复核项和预览项由 1→2、插入索引为 1、完整 `pictogramIdsBefore/After` 顺序正确、`insert_pictogram` 为非学习审计、活动草稿第二项来源为 `manual`。继续使用全 storage 快照、隔离和 finally 深比较恢复。
- 理由：“按钮存在”和“数组纯函数通过”都不能证明 Taro 事件、默认板选择器、微信 storage 与草稿覆盖共同工作；插入事件也不能进入词图学习。
- 证据：官方 Skill 完整 E2E 通过，最终输出包含 `manual insertion`，13 项原 storage 全部恢复；定向 receiver session `1 file / 12 tests`、全量 Vitest `22 files / 87 tests`、TypeScript、ESLint、`76 app / 18 core`、production build 和逐包门通过。44 boards / 825 tiles / 775 images 完整；未压缩主包 `293,081 B`、沟通分包 `1,402,290 B`。
- 生效范围：微信独立接收页、默认板插图选择、receiver draft/correction repository 和官方 Skill E2E；不改变患者首屏，不让 insert 参与学习，不上传预览、不发布。手机真机触控仍待最新预览复测。
- 记录：Codex（GPT-5），2026-07-18 21:51:04。

### 变动 60：设备私有熟悉图片官方运行闭环

- 意图：证明照护者选择患者熟悉照片后，小程序会把临时媒体转成可长期恢复的微信本地文件，并在患者图板、重启恢复和恢复默认之间保持一致。
- 决策：官方 Skill E2E 只 mock `wx.chooseMedia` 的用户选择结果，图片压缩、`wx.saveFile`、`wx.getSavedFileInfo` 和 `wx.removeSavedFile` 均调用微信真实 API；测试按当前患者/工作区保存 `scope: device-private` 偏好，重启后验证患者图板使用 `http://store/...`，再点击“恢复默认”并确认偏好和物理文件同时删除。自动化先快照全部 storage，finally 恢复原 13 项数据。
- 理由：只验证端口单测或管理器入口不能证明 Taro 回调、微信临时文件、持久文件、repository、页面重建和真实删除共同工作；设备私有照片也不能为了测试进入云同步或仓库 fixture。
- 证据：官方 Skill 完整 E2E 输出包含 `personal images`，选择后 repository 只有一条 schema v1、`device-private`、当前 patient/workspace 的记录，图片路径由真实 `http://tmp/...jpg` 转为不同的 `http://store/...jpg`；重新进入后患者图卡使用持久路径，恢复默认后 storage 为 `[]` 且真实 `getSavedFileInfo` 返回不存在。失败和成功路径均恢复 13 项原 storage，测试文件在 finally 删除。微信 `22 files / 87 tests`、TypeScript、ESLint、`76 app / 18 core`、production build 和逐包性能门通过；主包 `293,081 B`、沟通分包 `1,402,290 B`。
- 生效范围：微信个人图片管理器、患者图板显示、设备私有 repository、真实微信文件生命周期和官方 Skill E2E；不上传家庭照片、不进入账号同步、不执行手机预览上传，手机相册/相机触控仍待真机验收。
- 记录：Codex（GPT-5），2026-07-18 23:34:38。

### 变动 61：微信真实网络状态与离线能力提示

- 意图：让照护者在断网时明确知道“可选联网增强暂不可用，但本地图板与双向沟通没有坏”，补齐原图语家离线 MVP 的状态可见性。
- 决策：新增平台无关 `NetworkStatusPort`，微信 adapter 使用 `getNetworkType`、`onNetworkStatusChange` 和精确解绑；只有明确 `none/isConnected=false` 时才显示离线提示，API 失败保持 `unknown`，不误报。提示只放在折叠照护工具和独立接收页，不占患者首屏图卡空间。
- 理由：AI、在线补图和账号同步失败不能让家属误以为整个 AAC 工具不可用；同时网络状态 API 自身失败也不能被当作断网。患者首屏的图标优先级高于常驻技术状态。
- 证据：网络端口与文案 `2 files / 7 tests`，全量 Vitest `24 files / 94 tests`、TypeScript、ESLint、`82 app / 18 core`、production build 和逐包门通过；主包 `293,081 B`、沟通分包 `1,404,609 B`。恢复后的完整官方 Skill E2E 再次通过患者表达、接收、纠错、个人图片和 13 项 storage 恢复。官方 Skill 明确拒绝 mock 事件型 `wx.onNetworkStatusChange`，因此两次离线模拟失败均未写成 UI 通过，且 finally 均恢复原 storage。
- 生效范围：微信照护者工具、独立接收页、网络状态 adapter 和离线文案；不发起网络请求、不改变离线核心，不表示手机/模拟器真实断网 UI 已验收，不执行预览上传或发布。
- 记录：Codex（GPT-5），2026-07-19 00:05:41。

### 变动 62：网络状态规则和文案回归 CBoard 共享核心

- 意图：在微信离线提示已经跑通后，消除它与 CBoard Web 的重复判断，让两端对“离线仍可做什么、联网增强暂时缺什么”保持同一语义。
- 决策：把网络状态归一化和离线能力文案放入 CBoard `src/common/communicationSupport/networkStatus.js`；CBoard Web 新增 browser adapter 和照护者/接收端提示，微信 `NetworkStatusPort` 与 `NetworkStatusNotice` 改为消费该共享模块。显式连接布尔值优先于陈旧网络类型，API 失败保持 `unknown`；微信类型声明继续采用窄化 `.d.ts`，跨平台边界扫描新增该核心文件。
- 理由：网络语义是平台无关业务契约，`navigator`、Taro 和 UI 生命周期才是平台代码。共享纯核心能防止 Web 与微信文案和故障判断分叉，同时避免把 React DOM、Material UI 或全局 `wx` 搬进另一端。
- 证据：CBoard 定向 `4 suites / 27 tests`，完整沟通门 `52 suites / 362 tests / 3 snapshots`，production build 为 `Compiled successfully` 并生成 `977 resources / 41.2 MB` Service Worker。微信定向 `1 file / 4 tests`、全量 `23 files / 91 tests`、TypeScript、ESLint、`80 app / 19 core`、production build 和逐包门通过；未压缩主包 `293,081 B`、沟通分包 `1,404,908 B`。官方 Skill 完整 E2E PASS 并恢复原 13 项 storage。
- 生效范围：CBoard 中性网络核心、Web browser adapter/照护者 UI、微信网络 port/照护者 UI、类型和边界检查；不发起额外网络请求，不改变本地沟通核心，不把官方 Skill 无法 mock 的 `wx.onNetworkStatusChange` 写成真实断网通过，不执行预览上传或发布。
- 记录：Codex（GPT-5），2026-07-19 00:34:55。

## 验证命令

```powershell
yarn typecheck
yarn lint
yarn test
yarn check:boundary
yarn build:weapp
yarn test:e2e:weapp
yarn test:e2e:weapp:account # 假 API 账号同步门，结束后自动恢复默认构建
yarn test:e2e:weapp:enable-service # 仅首次且明确同意开启 localhost 服务端口时
```

当前结果：TypeScript、ESLint 与源码空白检查通过；Vitest `23 files / 91 tests`、边界扫描 `80 app files + 19 CBoard core files` 和固定 WechatSI 的 production build 均通过；CBoard 双向沟通既定回归为 `52 suites / 362 tests / 3 snapshots`，Web production build 也通过并生成 `977 resources / 41.2 MB` Service Worker。完整板包为 44 boards / 825 tiles / 775 PNG images，图卡资源 953,152 B；构建门禁拒绝旧 WebP、未打包图片、小于 200 B 的透明空图、超过 200 KiB 的媒体、未使用插件/组件、未压缩上传设置、缺少按需注入及单包超限。当前未压缩主包 `293,081 B`、沟通分包 `1,404,908 B`，均低于微信官方 1.5 MiB 建议线。官方 Skill E2E 已覆盖患者表达、独立接收展示、换图复用、删除 tombstone、关闭学习、后加图片及完整顺序/来源审计、修正记忆查看/停用、停用后本地图恢复、同会话双向历史、新对话保留历史、设备私有个人图片选择/持久化/重启恢复/默认回退/物理删除、AI 未配置降级、Console 和 13 项 storage 精确恢复。共享网络归一化、browser port、Web 离线 UI 和微信 port 分别已有自动化；官方 Skill 不能 mock `onNetworkStatusChange`，真实断网展示仍待真机/模拟器网络面板验收。患者朗读和照护者语音识别已由用户确认；自动/人工分词、8 张紧急图、完整话术样本、餐具 `4/4` 和安全缺词消解均已在官方模拟器验证。手机最新预览仍为上一版 `1,682,631 B`；本轮源码未获新的知情上传授权，不能冒充已推送。

> 说明：上段“当前结果”截至变动 62；患者反馈与复核恢复的最新增量结果以文末变动 65 为准。

## 明确不做

当前阶段不接入完整板编辑器、公开自定义图库上传、支付，也不把预览推送结果当作真机触控、旋转或系统断网验收。登录、云同步、AI 接口、常用语管理、历史管理和个人熟悉图片已进入代码；AI 已兼容 OpenAI-compatible 与 Azure OpenAI，但真实手机仍缺可访问的 HTTPS `cboard-api`、登录令牌和服务端提供方密钥。缺词搜索已有 ARASAAC 直连备用通道，但必须先配置合法域名且始终由照护者确认；个人图片严格留在本机。模板依赖中未引入 `react-dom`、H5 平台插件、MUI 或 Material UI。

## 依据

- [Taro React 18 官方说明](https://docs.taro.zone/docs/react-18)
- [Taro 官方目录结构](https://docs.taro.zone/docs/folder/)
- [Taro 微信项目配置](https://docs.taro.zone/docs/project-config)
- [微信官方：小程序性能优化指南](https://developers.weixin.qq.com/community/develop/doc/00040e5a0846706e893dcc24256009)
- [微信小程序自动化 JS SDK（npm）](https://www.npmjs.com/package/miniprogram-automator)
- [微信小程序 MCP：建议迁移到官方开发者工具 Skill](https://github.com/yfmeii/weapp-dev-mcp)
- [腾讯云开发者社区：开发者工具内置 Skills 工作流](https://cloud.tencent.com/developer/article/2709419)
- [Windows 调用 wechatide 的 PowerShell 7 实践](https://www.cnblogs.com/whiteEyeborw/p/21426623)

### 变动 63：患者理解反馈与可信编译验收

- 意图：把“照护者展示图片”补成真正的双向接收闭环，让患者能够明确反馈“明白了 / 没明白 / 再说一次”，而不是看完后只能由照护者猜测是否理解。
- 决策：复用 CBoard 中性 `receiverPatientFeedback.js` 契约，只允许 confirmed receive 记录追加 `understood`、`not_understood` 或 `repeat_requested`；记录最新状态并保留最多 20 条有序事件。Web 与微信使用同一 repository 语义；“再说一次”保存后留在全屏页并重播，“明白了 / 没明白”保存后返回照护者界面。存储失败不得困住患者，关闭或重播仍继续执行。
- 理由：接收图片序列、自动朗读和历史保存只能证明信息从照护者流向患者；患者理解反馈进入同一条已确认记录后，才能形成可追溯的双向沟通，并为后续照护调整提供证据。
- 证据：`cboard-api` model/controller/route 定向回归 `13 passing`；CBoard 中性回归 `53 suites / 369 tests / 3 snapshots` 与 production build 通过。扩大到旧 `Tuyujia` 包装层后为 `58/60 suites`、`386/388 tests`，两项失败均为既有旧断言债务：partial symptom 旧匹配预期和稳定 ID 历史去重预期，不属于本切片。微信 TypeScript、ESLint、Vitest `23 files / 91 tests`、`80 app / 20 core` 边界和 production build 通过；未压缩主包 `293,081 B`、沟通分包 `1,410,074 B`，仍低于官方 1.5 MiB 建议线。官方 Skill E2E 真实点击“再说一次”和“明白了”，验证事件顺序为 `repeat_requested → understood`、全屏停留/返回以及 13 项原 storage 恢复。
- 生效范围：CBoard Web、微信独立接收展示、共享 receiver repository/sync、`cboard-api` confirmed receive 白名单与 Swagger；不上传草稿、纠错或缺词，不执行 `auto_preview`、体验版上传或发布。当前证据是代码、单测、构建和官方模拟器，手机触控与当前源码预览仍待知情授权后验收。性能依据为[微信官方《小程序性能优化指南》原文](https://developers.weixin.qq.com/community/develop/doc/00040e5a0846706e893dcc24256009)。
- 记录：Codex（GPT-5），2026-07-19 01:39:33。

### 变动 64：开发者工具旧编译缓存的最小恢复路径

- 意图：避免“磁盘产物已更新、模拟器仍显示旧界面”被误判为业务代码失败，也避免用清空全部数据换取测试通过。
- 决策：当 `dist` 已包含目标选择器但官方 Skill 连续刷新仍读取旧 WXML 时，只调用 `debug_clear_cache --action cleanCompileCache`；不清理 storage、授权、会话、项目文件列表或全部模拟器缓存。清理后重新编译并完整重跑 E2E。
- 理由：`simulator_refresh` 成功只表示触发刷新，不证明新 JS 已进入运行时。最窄编译缓存清理既能恢复可信页面，又不会删除患者、照护者或登录数据。
- 证据：清理前失败截图仍显示旧“朗读 / 返回接收理解”底栏，且找不到 `#receiver-feedback-repeat`；磁盘 `dist` 同时已包含该选择器。执行 `cleanCompileCache` 后同一条 E2E 越过患者反馈段并最终 PASS，原 13 项 storage 全部恢复。
- 生效范围：图语家微信开发者工具本地调试与自动化排错；不修改生产代码、不改变项目配置、不清理业务数据，也不把缓存恢复等同于手机真机验收。
- 记录：Codex（GPT-5），2026-07-19 01:39:33。

### 变动 65：患者“没明白”后恢复照护复核与反馈历史

- 意图：修复独立患者展示页关闭后照护者输入、分词、复核图片和修正开关被重置的问题，并让反馈在历史中可见，而不是只存在于底层记录。
- 决策：保持患者展示为独立页面，不恢复曾经造成图片堆叠的同页遮罩；打开展示前创建平台无关 `ReceiverWorkspaceResumeState` 快照，保存会话、原文、分词、复核序列、活动草稿和学习开关。“没明白”返回时恢复快照并显示照护提示；再次展示未修改的 confirmed receive 时复用同一记录，避免重复确认和重复历史。共享核心统一反馈标签、照护提示和历史导出文字，Web 与微信分别使用原生 UI。
- 理由：患者结果页独立和照护复核连续性必须同时成立。把工作台保留在 DOM 下方会重现界面堆叠；重新创建空工作台会让照护者丢失人工修正；重新确认同一记录又会制造重复沟通证据。
- 证据：CBoard 定向 `3 suites / 13 tests` 与 production build 通过，Service Worker 为 `977 resources / 41.2 MB`。微信 TypeScript、ESLint、Vitest `23 files / 92 tests`、`80 app / 20 core` 边界和 production build 通过；逐包门报告主包 `293,081 B`、沟通分包 `1,412,749 B`、775 张 CBoard 图片共 `953,152 B`。首次构建被旧语法门准确拦截可选链/空值合并，改写源码后门禁原样通过。官方 Skill E2E 实际执行 `repeat_requested → not_understood → 恢复“想喝水”及 3 项复核 → 复用原记录再次展示 → understood`，历史显示“患者反馈：明白了”，finally 恢复 13 项原 storage。
- 生效范围：CBoard 共享反馈/历史核心、Web 历史管理、微信独立接收页与同页返回恢复、类型和官方 Skill E2E；快照只保证当前页面生命周期内返回，不冒充应用冷启动恢复，不自动修改分词或图片，不执行 `auto_preview`、体验版上传或发布。包体与质量依据为[微信官方《小程序性能优化指南》原文](https://developers.weixin.qq.com/community/develop/doc/00040e5a0846706e893dcc24256009)。
- 记录：Codex（GPT-5），2026-07-19 02:11:57。

### 变动 66：接收草稿与“没明白”记录的跨重启恢复

- 意图：让照护者在小程序页面重建、应用重开或患者选择“没明白”后，继续使用原文字、原分词、原图片顺序和人工修正，不因生命周期变化丢失沟通上下文。
- 决策：CBoard 共享 repository 升级到 schema v4，保存单一活动接收草稿和独立恢复标记；同一 patient/workspace/session 只保留一个活动草稿。恢复时优先读取草稿，confirmed 记录仅在最新反馈为 `not_understood` 时恢复；`understood` 清除恢复标记，显式“重新开始”才丢弃恢复记录。恢复直接消费已保存的 `pictogramSequence`，不重新运行 matcher。
- 理由：重新匹配会破坏照护者已经调整的图片顺序、人工插图、缺词占位和设备私有图片；并存多个草稿会造成重复历史和不确定恢复。恢复权与丢弃权必须由明确状态和用户操作控制。
- 证据：CBoard 定向 `3 suites / 22 tests` 通过。微信 TypeScript、ESLint、Vitest `23 files / 94 tests`、边界 `80 app files / 20 CBoard core files`、production build 和逐包门通过；主包 `293,081 B`、照护分包 `1,416,588 B`、775 张图片共 `953,152 B`。官方 Skill E2E 通过活动草稿 `reLaunch` 冷恢复、“没明白” confirmed record 冷恢复、无重复草稿、无重复确认记录、“明白了”清除恢复路径及全部既有双向沟通回归，finally 精确恢复原 13 项 storage。
- 生效范围：CBoard 共享 receiver repository/pipeline、CBoard Web 接收面板、微信独立接收页和官方 Skill 自动化；不新增专用 API，不上传本地恢复标记，不执行 `auto_preview`、体验版上传或发布，手机上的旧预览不会因此自动更新。包体与质量继续依据[微信官方《小程序性能优化指南》原文](https://developers.weixin.qq.com/community/develop/doc/00040e5a0846706e893dcc24256009)。
- 记录：Codex（GPT-5），2026-07-19 03:55:42。

### 变动 67：缺词可直接建立设备私有图片

- 意图：当 CBoard 默认板没有图片、在线搜索不可用或在线候选不适合患者时，让照护者直接拍照或选择熟悉图片，完成“缺词 → 人工图片 → 下一次自动使用”的本机闭环。
- 决策：复用 CBoard 运行时图符与缺词 repository，新增 `device-private` 图符来源；图符 ID 绑定缺词记录，明确标注“用户提供，仅限本机使用”。Web 复用现有压缩图片入口并保存到本地缺词记录；微信复用 `chooseMedia → saveFile` 端口，只有 repository 保存成功才保留文件。“恢复待处理”清除关联并删除微信持久文件。设备私图不进入 Settings、账号同步或公开 Board/Tile。
- 理由：在线补图受网络、合法域名和候选质量限制，患者熟悉物品也可能不存在于公共图库。人工选择应成为最终决定，但家庭照片不能被误传到账号云端或伪装成公开许可资源。
- 证据：CBoard 共享核心与接收界面 `38 suites / 324 tests`，缺词组件 `6/6`，production build 通过并生成 `977 resources / 41.2 MB` Service Worker。微信 TypeScript、ESLint、Vitest `24 files / 95 tests`、边界 `81 app files / 21 CBoard core files`、production build 与逐包门通过；主包 `293,081 B`、照护分包 `1,419,332 B`、775 张默认图片共 `953,152 B`。官方 Skill E2E 实际验证人工分词缺词、微信持久文件、下一次匹配显示、恢复待处理、物理文件删除、全部既有主链和原 13 项 storage 恢复。
- 生效范围：CBoard Web 缺词维护、微信独立接收页、共享 runtime pictogram/missing-token pipeline 和微信本地文件生命周期；不是完整板编辑器、公开上传或跨设备家庭图库，不执行 `auto_preview`、体验版上传或发布。质量继续依据[微信官方《小程序性能优化指南》原文](https://developers.weixin.qq.com/community/develop/doc/00040e5a0846706e893dcc24256009)。
- 记录：Codex（GPT-5），2026-07-19 04:34:32。

### 变动 68：`cboard-api` 优先、ARASAAC 直连容灾

- 意图：在完全复用既有图片搜索端口的前提下，避免配置 `cboard-api` 后因后端短时故障失去全部在线补图能力。
- 决策：新增纯组合 `fallbackPictogramSearchPort`；后端成功或正常返回空候选时不重复请求，只有后端失败才尝试 ARASAAC 直连。缓存按候选图片来源精确选择下载端口；设置页明确只发送缺词，不发送完整原句。
- 理由：后端适合统一代理、缓存与未来鉴权，但可选联网增强不能成为核心沟通单点故障；组合现有端口比复制搜索实现更小、更易测，也不会把网络失败传播到本地 matcher。
- 证据：定向 `3 files / 14 tests`、全量 Vitest `25 files / 100 tests`、TypeScript、ESLint、`83 app / 21 core`、production build 和逐包性能门通过；主包 `293,081 B`、照护分包 `1,421,025 B`。`cboard-api` 图片测试 `6 passing`；官方 Skill 完整 E2E PASS，13 项原 storage 全部恢复。
- 生效范围：微信缺词在线候选、候选图片缓存和照护设置说明；不自动采用图片，不发送完整句子、历史、语音或私图，不表示真实外网和合法域名已经通过。本轮未预览、未上传、未发布。质量依据为[微信官方《小程序性能优化指南》原文](https://developers.weixin.qq.com/community/develop/doc/00040e5a0846706e893dcc24256009)。
- 记录：Codex（GPT-5），2026-07-19 05:09:20。

### 变动 69：账号 session 原子回滚与官方同步运行门

- 意图：证明微信端 CBoard 登录与云同步不只是接口和单测，并避免 storage 写满或单键故障留下半份登录状态。
- 决策：session/token 双写任一步失败即尽力删除两键并返回未登录；退出分别清理两键。新增 `test:e2e:weapp:account`，用假 HTTPS API 编译后执行登录、远程常用语合并、Settings 与 confirmed receive 鉴权请求、私图隔离和退出，再自动重建默认配置。
- 理由：客户端需要同时承受微信 storage、Taro Promise、页面状态和网络响应；真实账号不适合进入自动化，测试地址也不能遗留在普通 `dist`。
- 证据：账号定向 `3 files / 17 tests`、全量 `25 files / 102 tests`、TypeScript、ESLint、`83 app / 21 core` 和 production build 通过；API confirmed receive `13 passing`。官方 Skill 完整 E2E PASS，13 项原 storage 恢复；假 API 分包 `1,421,168 B`，默认恢复后为 `1,421,096 B`，`dist` 不含测试地址或令牌。
- 生效范围：微信 CBoard 账号 session、设置页登录/同步/退出、自动化和构建恢复；不记录真实密码/令牌，不上传设备私图，不表示真实服务器、多设备冲突或邮箱激活已通过。本轮未预览、未上传、未发布。
- 记录：Codex（GPT-5），2026-07-19 05:56:18。

### 变动 70：OpenSymbols 署名、离线保存与撤销回收

- 意图：恢复原图语家 ARASAAC 之外的 OpenSymbols 补图能力，并证明候选从服务端到微信本机的完整生命周期。
- 决策：小程序不保存 OpenSymbols 密钥，也不直连任意 OpenSymbols 图片；只消费 `cboard-api` 返回的同源签名代理。候选显示图库/仓库与许可，必须由照护者确认后下载并 `saveFile`。点击“恢复待处理”时清除关联并 `removeSavedFile`，私图继续保留原有独立提示。
- 理由：许可信息必须跟随候选，外部密钥和 URL 必须留在服务端；离线缓存若没有撤销清理，会形成不可见的存储泄漏。区分私图与在线缓存提示也能避免照护者误解数据来源。
- 证据：OpenSymbols port 定向进入全量 Vitest `25 files / 103 tests`；TypeScript、ESLint、`83 app / 21 core`、production build 和逐包门通过。官方 Skill E2E 显示 `OpenSymbols / mulberry · CC BY-SA 2.0 UK`，确认后 `getSavedFileInfo` 为存在，恢复后同一路径为不存在；完整主链、13 项原 storage 和默认构建恢复。主包 `293,081 B`、照护分包 `1,421,593 B`。
- 生效范围：微信缺词在线候选、来源许可展示、本机图片缓存、恢复待处理和官方 Skill E2E；不代表真实 OpenSymbols 外网、合法域名或手机网络已验收，不执行预览、上传或发布。质量依据为[微信官方《小程序性能优化指南》原文](https://developers.weixin.qq.com/community/develop/doc/00040e5a0846706e893dcc24256009)。
- 记录：Codex（GPT-5），2026-07-19 07:01:49。

### 变动 71：来源许可进入独立患者全屏与确认记录

- 意图：让患者和照护者在最终展示阶段仍能看见图片来源，并让 confirmed receive 保留可审计的图库、许可与作者信息。
- 决策：微信继续复用 CBoard 中性 `PictogramAttribution`；OpenSymbols、ARASAAC 和公开 CBoard 来源进入输出预览与 receiver contract v2，独立患者页在图片序列后显示紧凑只读归属。设备私图只留本机，账号同步前删除 attribution 和私有 pictogramId。
- 理由：候选卡署名不足以证明最终采用的图；来源信息若只写在微信组件里，也无法被 Web、历史和 API 复用。把它放进纯核心可以保持 Taro UI 轻量，同时避免隐私图片借许可字段进入云端。
- 证据：Vitest `25 files / 103 tests`、TypeScript、ESLint 与 production build 通过；官方 Skill 账号版 E2E 断言全屏显示 `OpenSymbols / mulberry` 和 `CC BY-SA 2.0 UK`，确认记录为 v2、来源为 `opensymbols`、repoKey 为 `mulberry`。测试同时验证恢复待处理删除缓存；修复了恢复后立即自动重搜覆盖删除提示的竞态，最终 PASS 并恢复 13 项原 storage。
- 生效范围：微信接收端候选、确认、独立患者展示、离线缓存和账号同步边界；压缩默认板仅提供集合级许可回退，不声称逐图来源已从压缩文件名还原。默认构建主包 `293,081 B`、照护分包 `1,426,570 B`，仍低于官方 1.5 MiB 建议线；现有 `sub-vendors.js 298 KiB` 警告待后续分包优化。本轮未预览、上传或发布，性能依据为[微信官方原文](https://developers.weixin.qq.com/community/develop/doc/00040e5a0846706e893dcc24256009)。
- 记录：Codex（GPT-5.6），2026-07-19 08:17:35。

### 变动 72：AAC 文件导入继续留在 CBoard Web

- 意图：复用 CBoard 已成熟的 OBF/OBZ 能力，又不让微信小程序因导入器、完整编辑器和 Web UI依赖增加包体与平台耦合。
- 决策：OBF/OBZ 在 CBoard Web 中完成校验并转换为 CBoard Board，再由中性 `createBoardDTO` 生成小程序可消费内容。微信不复制 FileReader、JSZip、React DOM、Material UI 或完整 Board 编辑器。
- 理由：小程序核心职责是快速、离线地完成点图表达和双向接收；导入与复杂编辑属于低频照护管理。按平台拆责比复制整套 Web 代码更稳，也符合微信主包、分包、无依赖文件和按需注入要求。
- 证据：CBoard OBF/OBZ 定向 `4/4`、相关面 `40 suites / 328 tests / 4 snapshots` 与标准 production build 通过；合法导入保留固定顺序和匹配同义词，坏文件不会生成空看板。本切片未修改微信源码、插件、依赖或媒体。
- 生效范围：后续内容制作/导入流程与微信 BoardDTO 消费边界；不表示小程序支持本机导入 OBF/OBZ，也不阻止未来建立服务端内容分发。质量依据为[微信官方《小程序性能优化指南》原文](https://developers.weixin.qq.com/community/develop/doc/00040e5a0846706e893dcc24256009)，本轮未预览、上传或发布。
- 记录：Codex（GPT-5.6），2026-07-19 08:32:54。

### 变动 73：关联词随 TileDTO 保留，但永不触发自动匹配

- 意图：让照护者在 CBoard Web 中记录“有关但不等义”的概念关系，并确保小程序消费相同 TileDTO 时不会把相关词误当成图片匹配词。
- 决策：微信类型声明兼容可选 `communication.relatedTerms`，继续直接复用 CBoard matcher；不在 Taro 页面复制完整 TileEditor。相关词的编辑和 OBF 往返留在 Web，小程序只消费规范化 DTO。
- 理由：相关词属于内容策展，不属于患者输入的自动命中规则；把 Web 编辑器搬进微信会增加包体和平台耦合，而只扩展轻量类型不会改变运行主链。
- 证据：微信 TypeScript、ESLint、Vitest `25 files / 103 tests`、边界 `83 app files / 21 CBoard core files`、44 boards / 825 tiles / 775 images 和 production build 全通过。主包 `293,081 B`、照护分包 `1,426,891 B`；无 `200 KiB` 媒体违规，`WechatSI` 有真实 `requirePlugin`，JS/WXML/WXSS 压缩、无依赖过滤与 `lazyCodeLoading: requiredComponents` 均通过自动门禁。CBoard 对应面为 `42 suites / 334 tests / 6 snapshots` 和标准 production build。
- 生效范围：微信 TileDTO 类型、共享 matcher 编译与后续板内容生成；不增加小程序编辑 UI，不改变自动匹配，不执行 `auto_preview`、体验版上传或发布。现有 `sub-vendors.js 305,085 B` 警告继续作为分包优化项；性能依据为[微信官方《小程序性能优化指南》原文](https://developers.weixin.qq.com/community/develop/doc/00040e5a0846706e893dcc24256009)。
- 记录：Codex（GPT-5.6），2026-07-19 08:51:09。

### 变动 74：候选句空闲自动播报复用共享控制器

- 意图：按图语家 issue #36 减少患者生成候选句后的额外操作，并确保患者一旦主动触摸或滚动，自动语音不会继续打断沟通。
- 决策：`ExpressionWorkspace` 复用 CBoard `candidateAutoplay` 和现有 `wechatSpeechPort`；默认 15 秒依次播报全部候选句，单击候选只播该句，全部播报与自动播报共用同一队列，停止、触摸、滚动、换图和页面卸载取消旧计时/语音。照护设置提供关闭、5、10、15、30 秒并沿用微信本地偏好存储。
- 理由：WechatSI 已经真实可用，无需引入第二个语音库；纯控制器只负责时间、快照和取消，使微信 UI 保持轻量并与 CBoard Web 使用相同产品语义。
- 证据：TypeScript、ESLint、Vitest `25 files / 103 tests`、边界 `83 app / 21 CBoard core`、44 boards / 825 tiles / 775 images 和 production quality gate 通过。未压缩主包 `293,081 B`、照护分包 `1,430,974 B`、默认图片 `953,152 B`；没有新增插件、依赖或超过 200 KiB 的媒体，现有 `sub-vendors.js 305,350 B` 告警继续保留。
- 生效范围：微信患者表达、照护者设置、TTS 队列和本机偏好；不改变候选句算法、语音插件配置、账号/API 或图片资源。本轮遵循后台开发要求，没有启动/置顶开发者工具，没有执行模拟器 E2E、预览、上传或发布；生产质量继续依据[微信官方《小程序性能优化指南》原文](https://developers.weixin.qq.com/community/develop/doc/00040e5a0846706e893dcc24256009)。
- 记录：Codex（GPT-5.6），2026-07-19 09:26:52。

### 变动 75：固定顺序与常用优先复用 CBoard 共享核心

- 意图：让小程序恢复图语家已验证的图卡人工顺序和实际使用频率排序，而不是把默认 BoardDTO 顺序写死。
- 决策：患者成功点选叶子图卡后，以 `boardId:tileId` 写入独立微信 storage；导航文件夹不计数、不移动。照护设置提供“固定顺序 / 常用优先”，并可选择板块逐项上移/下移；切回固定顺序恢复精确人工结果。
- 理由：患者空间记忆需要稳定默认顺序，高频表达又需要可选捷径。排序/计数复用 CBoard 纯核心，Taro 只保留微信 storage adapter 和轻量 UI，不搬运 React DOM、Material UI 或完整板编辑器。
- 证据：TypeScript、ESLint、Vitest `26 files / 104 tests`、边界 `85 app / 21 CBoard core`、44 boards / 825 tiles / 775 images 和 production quality gate 通过。主包 `293,693 B`、照护分包 `1,438,578 B`、默认图片 `953,152 B`；未新增依赖、插件或媒体，现有 `sub-vendors.js 298 KiB` 告警继续保留。
- 生效范围：微信患者表达、照护者显示设置和本机图卡顺序/计数；不进入账号同步，不影响分词、matcher、候选句或 TTS。本轮后台开发，未启动/置顶开发者工具，未执行模拟器 E2E、预览、上传或发布；质量依据为[微信官方《小程序性能优化指南》原文](https://developers.weixin.qq.com/community/develop/doc/00040e5a0846706e893dcc24256009)。
- 记录：Codex（GPT-5.6），2026-07-19 10:28:01。

### 变动 76：默认图卡逐项恢复上游来源许可

- 意图：让压缩后的 775 张 CBoard 默认图仍能在接收全屏展示真实提供方和许可，而不是全部只显示集合级回退。
- 决策：在默认板 fixture adapter 按上游 `labelKey` 识别 Mulberry、ARASAAC、CBoard，并复用 CBoard `pictogramAttribution` 生成规范字段；自动化逐项读取上游 `boards.json` 对照，新增提供方但未建规则时必须失败。
- 理由：哈希文件名适合离线包体但会丢失路径语义；提供方识别放在轻量 adapter，可以保留许可而不复制图片、Web Board 数据或第三方库。
- 证据：825 张 TileDTO 均有有效 attribution，分布为 Mulberry `782`、ARASAAC `26`、CBoard `17`。TypeScript、ESLint、Vitest `27 files / 106 tests`、边界 `87 app / 22 CBoard core`、44 boards / 825 tiles / 775 images 与 production quality gate 通过。主包 `293,693 B`、照护分包 `1,439,771 B`、默认图片 `953,152 B`；没有新增媒体、插件或依赖，现有 `sub-vendors.js 300 KiB` 告警未隐藏。
- 生效范围：微信默认图卡 DTO、接收全屏许可显示和公共记录 attribution；不影响图片内容、匹配、人工顺序、个人私图或网络请求。本轮全程后台执行，未启动或置顶开发者工具，未预览、上传或发布；性能继续依据[微信官方《小程序性能优化指南》原文](https://developers.weixin.qq.com/community/develop/doc/00040e5a0846706e893dcc24256009)。
- 记录：Codex（GPT-5.6），2026-07-19 10:48:08。

### 变动 77：接入微信原生版本更新提示

- 意图：迁移原 PicInterpreter 的新版本提示能力，降低旧包缓存造成的“功能明明已修复但客户端仍像旧版”风险。
- 决策：新增纯更新状态机与 Taro `getUpdateManager` adapter；只有新包下载完成才显示全局横幅，用户可立即更新或稍后。检查中、无更新和下载失败均不打扰患者，当前沟通始终可继续。
- 理由：微信不使用 PWA Service Worker，但可以保留原 MVP 的知情更新语义；纯 port 可测试，UI 不依赖 React DOM、Material UI 或新库。
- 证据：聚焦 `1 file / 2 tests`、全量 Vitest `28 files / 108 tests`、TypeScript、ESLint、边界 `91 app / 22 CBoard core` 和 production quality gate 通过；生产 `app.js/app.wxss` 已包含 `getUpdateManager`、`app-update-banner`、`app-update-apply`、`app-update-dismiss`。主包 `295,964 B`、照护分包 `1,439,771 B`。
- 生效范围：微信全局版本更新提示；不读取或清除业务数据，不影响语音、分词、图卡、账号或同步。本轮后台开发，未打开开发者工具，未预览、上传或发布。开发版/体验版没有正式版本更新语义，真实 `onUpdateReady → applyUpdate` 需在正式发布后的新旧版本切换中验收；性能继续依据[微信官方《小程序性能优化指南》原文](https://developers.weixin.qq.com/community/develop/doc/00040e5a0846706e893dcc24256009)。
- 记录：Codex（GPT-5.6），2026-07-19 10:56:59。

### 变动 78：已选图片支持逐项左移、右移和删除

- 意图：让患者在候选句生成、朗读和保存前直接修正图片序列，而不是误选中间图片后只能清空重来。
- 决策：微信 reducer 复用 CBoard `moveExpressionOutputItem/removeExpressionOutputItem`；每张已选图片提供左移、右移、删除按钮，首尾越界按钮禁用。每次有效修改都重建本地候选并取消旧自动播报或当前朗读。
- 理由：图片顺序直接决定句意，人工修正必须在患者表达主链内可见；复用纯核心比在 Taro 页面手写数组逻辑更易测试，也不会引入 React DOM、Material UI、新依赖或新图片。
- 证据：session 聚焦 `1 file / 7 tests`、全量 Vitest `28 files / 109 tests`、TypeScript、ESLint、边界 `91 app / 22 CBoard core` 和 production quality gate 通过。生产产物含 `expression-selected-{index}-left/right/remove`、对应 action 和 52px 按钮样式；主包 `295,964 B`、照护分包 `1,441,731 B`、775 张图片 `953,152 B`。
- 生效范围：患者表达页的当前已选图片、候选句和语音队列；保留“撤回一张/清空”，不影响图板顺序设置、接收端修正、账号、AI、图片资源或 API。本轮只用后台 shell，未打开或置顶开发者工具，未执行预览、上传或发布；性能继续依据[微信官方《小程序性能优化指南》原文](https://developers.weixin.qq.com/community/develop/doc/00040e5a0846706e893dcc24256009)。
- 记录：Codex（GPT-5.6），2026-07-19 11:13:39。

### 变动 79：常用语支持一键播报且不覆盖当前表达

- 意图：恢复原图语家高频短语一次点击立即发声的能力，避免“先载入、再选候选、再朗读”的多余步骤。
- 决策：常用语卡片提供独立的“一键播报”和“载入修改”。一键播报停止旧语音、朗读保存的原句并记录一次使用，但不替换当前 session；载入修改继续进入既有表达管线。
- 理由：即时播报和继续编辑是两种不同意图；分开后既能快速求助，也不会丢掉患者尚未完成的图片序列。实现复用既有 saved phrase service、WechatSI/TTS port 和 storage，不增加播放器、依赖、插件或媒体。
- 证据：全量 Vitest `28 files / 109 tests`、TypeScript、ESLint、边界 `91 app / 22 CBoard core` 和 production quality gate 通过；生产产物 `packages/caregiver/pages/patient/index.js` 含“一键播报”和“载入修改”。主包 `295,964 B`、照护分包 `1,442,390 B`、775 张图片共 `953,152 B`，现有 `sub-vendors.js 300 KiB` 告警未隐藏。
- 生效范围：微信患者表达页的前 6 条高频常用语、使用次数和语音队列；不改变当前表达、常用语管理器、历史、接收端、AI 或云 API。当前未迁移原 MVP 专用全屏播放遮罩；本轮只在后台 shell 开发，未启动或置顶开发者工具，未预览、上传或发布。性能继续依据[微信官方《小程序性能优化指南》原文](https://developers.weixin.qq.com/community/develop/doc/00040e5a0846706e893dcc24256009)。
- 记录：Codex（GPT-5.6），2026-07-19 11:39:07。

### 变动 80：常用语播报显示全屏大图和大字

- 意图：恢复原图语家 `PlaybackOverlay` 的面对面视觉沟通，不让“一键播报”只剩下声音。
- 决策：点击常用语后打开轻量全屏层，展示全部保存图卡、标签和原句；语音自动开始，完成后页面保留，可重播或完成关闭。重播不增加使用次数，关闭会停止当前语音并保留患者原有表达。
- 理由：图语家的核心是图文辅助理解；在静音、嘈杂或听觉理解困难场景中，沟通对象需要直接看到大图和句子。实现只使用 Taro 原生组件、现有 WechatSI/TTS port 和 saved phrase 数据。
- 证据：TypeScript、ESLint、全量 Vitest `28 files / 109 tests`、边界 `92 app / 22 CBoard core` 与 production quality gate 通过；生产分包含 `phrase-playback-overlay`、`phrase-playback-replay`、`phrase-playback-close`、高对比样式及上下安全区。主包 `295,964 B`，照护分包 `1,447,071 B`，775 张图片共 `953,152 B`，没有新增图片、插件或依赖。
- 生效范围：微信患者表达页常用语的全屏图文显示、重播和完成；不改变当前图片序列、常用语管理、接收端、账号或云服务。本轮全程后台构建，没有打开或置顶开发者工具，没有预览、上传或发布；真机视觉、长短语滚动和读屏仍待后续明确授权验收。性能继续依据[微信官方《小程序性能优化指南》原文](https://developers.weixin.qq.com/community/develop/doc/00040e5a0846706e893dcc24256009)。
- 记录：Codex（GPT-5.6），2026-07-19 11:56:41。

### 变动 81：个人图片管理迁入既有图库备份分包

- 意图：在保留个人熟悉图片完整功能的同时，扩大患者表达与接收核心分包距离微信官方 1.5 MB 建议线的余量，避免继续横向加功能后才被迫大拆包。
- 决策：照护工具中的“个人图片”按钮改为进入 `/packages/backup/pages/personal-images/index`；管理组件、设备私图 repository 和文件生命周期保持不变。默认 CBoard 图片只在该页面渲染时从照护资源路径重写为备份分包路径，`wxfile://` 私图和外部图片不改写；返回患者页后重新加载偏好，并同步更新当前已选图片和输出快照。不创建第三个资源分包，也不复制第三份 775 张图片。
- 理由：个人图片管理是低频照护工具，而患者点图、候选、朗读和接收必须快速进入。既有备份分包已经包含完整默认图库，直接复用它比建立新分包再增加约 953 KB 图片更节省总包体，也比让低频管理 UI 常驻照护分包更符合按需加载。
- 证据：资源路径纯函数 `2/2`，微信全量 Vitest `36 files / 125 tests`、TypeScript、ESLint、`111 app / 26 core` 边界和 production quality gate 全部通过。产物检索证明 `personal-image-search` 与“个人熟悉图片”只存在于备份分包。未压缩主包由 `296,078 B` 变为 `296,154 B`，照护分包由 `1,490,524 B` 降为 `1,482,197 B`，备份分包由 `1,350,055 B` 增为 `1,389,866 B`；三包均低于十进制 1,500,000 B，照护分包余量由 `9,476 B` 增至 `17,803 B`。WechatIDE 登录有效且 Skill `0.3.0` 对齐，但当前项目无 runtime。
- 生效范围：微信个人熟悉图片入口、管理页面归属、默认图片分包路径、患者页返回刷新和官方 E2E 路径断言；不改变设备私图 schema、来源说明、物理文件删除、账号同步、CBoard Web、语音、分词或 matcher。本轮遵守后台开发约束，没有调用 `open_project_window`、没有置顶或抢焦点，也未预览、上传、发布、提交或推送；待用户手动打开项目且窗口可后台复用时再运行官方 Skill E2E。性能依据为[微信官方《小程序性能优化指南》原文](https://developers.weixin.qq.com/community/develop/doc/00040e5a0846706e893dcc24256009)。
- 记录：Codex（GPT-5.6），2026-07-19 18:07:00。

### 变动 82：表达保存失败时保留现场并允许重试

- 意图：落实图语家 issue #29，避免微信 storage 或 repository 写入失败后丢失患者当前图片序列、候选句或所选句。
- 决策：`ExpressionWorkspace` 通过共享 `persistExpressionHistoryEntry` 执行确认与已确认候选反馈回写；返回空记录或抛异常时继续显示当前表达并给出“表达已生成，但本地保存失败，请稍后再试”，只有真实返回记录才标记保存成功。
- 理由：小程序 storage 可能因容量、系统状态或数据损坏失败，但这不能中断当下 AAC 沟通。复用 CBoard 纯核心比在 Taro 内另写 `try/catch` 更能保证两端语义一致。
- 证据：微信全量 Vitest `36 files / 125 tests`、TypeScript、ESLint、边界 `111 app / 26 CBoard core` 与 production gate 通过；未压缩主包 `296,154 B`、照护分包 `1,482,340 B`、备份分包 `1,389,866 B`，均低于项目采用的 `1,500,000 B` 预警线。
- 生效范围：微信患者表达确认和候选反馈回写；不改变 storage schema、语音、分词、图卡、候选算法、账号或 API。开发和验证全程在后台完成，没有打开、置顶或抢占微信开发者工具窗口，没有预览、上传、发布、提交或推送。
- 记录：Codex（GPT-5.6），2026-07-19 18:26:19。

### 变动 83：接收场景与新对话上下文完成微信迁移

- 意图：恢复图语家 issue #13/#23 的场景提示和安全换新会话能力，避免患者开始新对话后 AI 仍读取上一会话历史。
- 决策：接收页提供医院、家庭、康复门诊三个 52px 固定按钮，再次点击已选项可清除；场景保存在当前微信 session 并发送给 AI port。患者页和接收页开始新对话均先调用 `Taro.showModal`，确认后换 session、清场景和当前工作区，但保留历史。表达 AI 改读 repository 当前 session context，不再读全部 `recentHistory`。
- 理由：固定场景比任意文本或 GPS 更安全、可测试；真正的新对话必须清空模型上下文，而不是只改变界面或 session ID。
- 证据：最终 TypeScript、ESLint、Vitest `36 files / 125 tests`、边界 `111 app / 26 CBoard core` 与 production gate 通过。主包 `296,154 B`、照护分包 `1,486,889 B`、备份分包 `1,390,664 B`，没有新增依赖、插件或媒体。
- 生效范围：微信患者表达、照护接收、AI port 和共享会话 repository；不读取 GPS、不删除历史、不改变语音、分词、matcher 或图片资源。本轮只在后台执行，没有打开、置顶或聚焦开发者工具，没有预览、上传、发布、提交或推送。
- 记录：Codex（GPT-5.6），2026-07-19 18:55:01。

### 变动 84：表达文字与接收长图支持异步分享

- 意图：落实图语家 issue #18，让患者分享当前选中句，让照护者把确认后的图片序列作为一张移动端可读长图分享出去。
- 决策：小程序复用 CBoard `CommunicationShare contract v1`。患者页“复制分享句子”只复制当前选中句，不触发朗读、保存或清空；接收页“分享图片序列”用离屏 Canvas 生成带编号、照护原文和来源许可的 PNG，再调用微信原生 `showShareImageMenu`。用户取消或单张图片失败时保留当前沟通现场。
- 理由：微信没有与浏览器 Web Share 完全相同的任意文字分享接口，复制后由用户粘贴到微信或其他应用是可预期的平台等价方案；图片使用原生分享菜单可以避免引入上传服务、第三方 SDK 或额外媒体。
- 证据：微信全量 Vitest `37 files / 128 tests`、TypeScript、ESLint、边界 `114 app / 26 CBoard core` 与 production quality gate 全部通过。生产产物实际包含 `showShareImageMenu`、`expression-share-button` 和 `receiver-display-share`；未压缩主包 `296,154 B`、照护分包 `1,494,853 B`、备份分包 `1,390,664 B`，775 张默认图片共 `953,152 B`。
- 生效范围：微信患者表达页、照护接收页、Taro 分享 port 与共享 Canvas 核心；不改变语音、分词、图片匹配、历史、账号、AI、API 或 storage schema，不新增插件、依赖或媒体。照护分包只剩 `5,147 B` 预警余量，后续低频功能必须拆到备份/独立分包。本轮仅后台 shell 构建，没有打开、置顶、聚焦或抢占开发者工具窗口，也没有预览、上传、发布、提交或推送；真机长图清晰度、取消、微信好友/文件分享仍待后续明确授权验收。性能继续依据[微信官方《小程序性能优化指南》原文](https://developers.weixin.qq.com/community/develop/doc/00040e5a0846706e893dcc24256009)。
- 记录：Codex（GPT-5.6），2026-07-19 19:40:29。

### 变动 85：完整本机备份与两级隐私清除进入 backup 分包

- 意图：落实 issue #45，让设备交接前可导出全部可恢复数据，并让用户按风险选择只清私人图片或清空当前小程序设备。
- 决策：现有图库 ZIP 服务增加 `device-data.json`、`pictograms.json`、`categories.json`、`expressions.json`；备份页新增“设备交接与隐私”。私人清除先删除个人换图和本机补图文件，再更新 repository；全部清除删除微信保存文件、图语家生成文件、图库目录和全部 storage，成功后回到首次进入页。两个清除动作均使用 `Taro.showModal`。
- 理由：备份与清理是低频照护操作，不应继续挤占只剩约 5 KB 的 caregiver 分包；复用 backup 分包的 JSZip、775 张图片和文件端口，可以避免重复资源并保持患者沟通首屏轻量。
- 证据：聚焦 `2 files / 9 tests`、全量 Vitest `38 files / 133 tests`、TypeScript、ESLint、边界 `117 app / 26 CBoard core` 与 production quality gate 通过。未压缩主包 `296,154 B`、caregiver `1,494,954 B`、backup `1,401,424 B`；44 块板、825 张图卡、775 张图片和 `953,152 B` 图片资源检查通过。
- 生效范围：微信 `packages/backup` 页面、备份服务、Taro 本机文件/storage 端口及共享 LocalDeviceData 核心；不删除云端账号或同步数据，不新增依赖、插件、图片或音频。本轮只使用后台 shell，允许后台操作开发者工具但未调用，不置顶、不聚焦、不抢占窗口，未预览、上传、发布、提交或推送。真机 ZIP 分享、物理文件清除和重启后首次进入仍待人工验收；性能依据为[微信官方《小程序性能优化指南》原文](https://developers.weixin.qq.com/community/develop/doc/00040e5a0846706e893dcc24256009)。
- 记录：Codex（GPT-5.6），2026-07-19 20:18:20。

### 变动 86：全部本机清除覆盖历史与常用语中文导出文件

- 意图：修复“清全部本机数据”只识别英文 `picinterpreter-*` 文件名、可能遗漏历史和常用语服务实际生成文件的隐私边界缺口。
- 决策：文件端口继续清理保存文件注册表和图库目录，并把 `图语家_对话记录_*.txt`、`图语家_常用语_*.json` 与既有 `picinterpreter-*.(zip|json|txt)` 一并识别为图语家生成文件；其他未知用户文件不做宽泛删除。
- 理由：历史与常用语导出采用中文文件名，旧规则无法命中；直接清空整个 `USER_DATA_PATH` 又可能误删不属于本功能的数据。显式白名单兼顾完整清除与最小删除范围。
- 证据：生成文件识别新增中文正反例，聚焦 `2 files / 10 tests`、最终全量 Vitest `38 files / 134 tests`、TypeScript、ESLint、边界 `117 app / 26 CBoard core` 和 production quality gate 全部通过。未压缩主包 `296,154 B`、caregiver `1,494,954 B`、backup `1,401,568 B`；44 块板、825 张图卡、775 张图片和 `953,152 B` 图片资源检查通过。
- 生效范围：微信 `localDeviceDataPort` 对本应用已知生成文件的清理范围；不删除未知文件、云端账号或同步数据，不改变 ZIP 格式、页面入口、二次确认或核心沟通功能。全程仅后台命令，没有打开、置顶、聚焦或抢占开发者工具窗口，也没有预览、上传、发布、提交或推送。
- 记录：Codex（GPT-5.6），2026-07-19 20:28:12。

### 变动 87：真实粤语录音识别进入接收端人工复核链

- 意图：让照护者在微信接收端直接录制粤语并取得可编辑文字，而不是继续依赖不保证粤语的 WechatSI `zh_CN` 路径或手工转写。
- 决策：粤语模式显示独立的单次同意开关和“粤语录音识别”按钮。开始前验证 API URL、登录 token 和本次同意；录音使用微信原生 `RecorderManager` 的 16 kHz、单声道、48 kbps MP3，最长 30 秒，停止后经鉴权 multipart 上传。结果只覆盖可编辑原文并清空旧分词/复核状态，不自动运行文字规范化、matcher、历史、朗读或发送；取消、切换模式、重置和离开页面都会终止请求并尽力删除临时 MP3。
- 理由：微信语音插件当前普通话路径已经可用，但不能冒充粤语识别。独立 port 既复用 `cboard-api` 服务端持密钥能力，也把录音隐私、网络失败和提供方迟到响应与患者图卡主链隔离。
- 证据：端口单元测试 `6/6` 覆盖逐次同意、录音参数、鉴权上传、3 MiB 超限、503、取消/迟到结果、麦克风错误和临时文件清理；微信全量 `46 files / 167 tests`、TypeScript、ESLint、`140 app / 26 CBoard core` 边界与 production quality gate 通过。生产未压缩 main `296,262 B`、caregiver `1,518,551 B`、backup `1,435,407 B`、OCR `43,650 B`；caregiver 仍低于 `1.5 MiB` 质量门，44 boards / 825 tiles / 775 images 与 3 张紧急资源完整，没有新增插件、依赖、图片或音频。
- 生效范围：微信照护者接收页、`DialectAudioRecognitionPort`、Taro 录音/上传 adapter 和隐私文案；不改变患者点图、普通话 WechatSI、TTS、默认板、账号同步或离线文字输入。生产环境仍需配置 `TARO_APP_API_BASE_URL`、正式登录和腾讯云 ASR 凭据，并以真实粤语录音验收识别质量。本轮只用后台命令，没有打开、置顶、聚焦或抢占开发者工具窗口，也未预览、上传、发布、提交或推送。
- 记录：Codex（GPT-5.6），2026-07-20 01:51:07。

### 变动 88：账号合并清洗设备私图并显示冲突结果

- 意图：让照护者登录后安全合并设备上的公共沟通数据，并能从完成提示中判断远端新增、本机上传和冲突覆盖情况。
- 决策：微信上传 settings 和合并旧云 settings 前统一调用 CBoard 纯核心 sanitizer；设备私有图符移除 ID、署名、私有元数据及 `blob:`、`data:`、`file:`、`wxfile:`、微信临时/用户目录路径，只保留文字标签，公共图片引用保持不变。相同句子常用语和同 ID 历史按 `updatedAt` 合并，同时间保留本机版本；完成提示展示新增数、上传数、冲突数及本机/云端胜出数。
- 理由：私人图片可能嵌在常用语或遗留历史中，不能只过滤接收记录；同步结果若不可见，用户无法判断数据是否被覆盖。复用 CBoard 核心还能避免微信另写一套隐私和冲突规则。
- 证据：cloud sync 聚焦 `7/7`、全量 Vitest `46 files / 169 tests`、TypeScript、ESLint、`140 app / 26 CBoard core` 边界与 production quality gate 全部通过。未压缩主包 `296,262 B`、caregiver `1,521,355 B`、backup `1,437,913 B`、OCR `46,156 B`；44 boards / 825 tiles / 775 images 和 3 张紧急资源完整。
- 生效范围：微信账号同步 adapter、登录合并入口与结果文案；不迁移私人图片文件、纠错、缺词或录音，不改变图板、matcher、语音和 API schema。真实多设备并发和私人图片显式迁移仍待后续。本轮仅后台执行，没有打开、置顶、聚焦或抢占开发者工具窗口，也未预览、上传、发布、提交或推送。
- 记录：Codex（GPT-5.6），2026-07-20 02:23:24。

### 变动 89：确认记录使用版本冲突和结构化墓碑同步

- 意图：防止旧手机恢复联网后覆盖患者已经看过的接收记录，并让照护者知道本轮同步是否发生冲突。
- 决策：微信账号同步为每条确认记录发送 `baseVersion`，接收并本地保存 `serverVersion/conflicted`；服务端冲突时以规范记录为准，但本机新增患者反馈与远端反馈合并后留待下一轮重试。删除同时接受 ID 列表和带 `deletedAt/deletedBy/serverVersion` 的结构化墓碑，墓碑优先于任何过期活动记录。同步和上传完成提示显示确认记录冲突数量。
- 理由：确认记录的文字和图片序列是患者实际看到的沟通事实，不能使用普通 Settings 的最后写入覆盖；反馈可以安全追加，删除必须跨设备保持最终性。
- 证据：账号端口和云同步聚焦 `2 files / 16 tests`，全量 Vitest `46 files / 171 tests`、TypeScript、ESLint、`140 app / 26 CBoard core` 边界与 production gate 通过。未压缩 main `296,262 B`、caregiver `1,523,654 B`、backup `1,439,578 B`、OCR `47,821 B`；44 boards / 825 tiles / 775 images 与 3 张紧急资源完整。
- 生效范围：微信 `cboardAccountPort`、`communicationCloudSync`、账户同步提示及共享 CBoard receiver sync 核心；不改变患者表达、照护分词、matcher、语音或本机私人图片。当前证据不代表真实 HTTPS/Mongo、多手机并发或匿名设备 ID 退役已经通过。全程仅后台命令，没有打开、置顶、聚焦或抢占开发者工具窗口，也未预览、上传、发布、提交或推送。
- 记录：Codex（GPT-5.6），2026-07-20 03:05:44。

### 变动 90：账号同步后端完成真实本地并发请求验证

- 意图：确认微信账号端口依赖的 CBoard API 不只是 mock 可用，在真实登录、HTTP 和 Mongo 下也能识别同时反馈冲突并保住两台设备的反馈。
- 决策：不向小程序复制数据库或并发逻辑，继续复用 `CBoardAccountPort`、共享 receiver sync 和服务端版本协议；真实运行门放在 `cboard-api` 的可重复 smoke 命令中，使用两个同时发出的同版本反馈请求验证冲突、合并和重试。
- 理由：小程序应保持轻量，服务端才是账号版本的可信边界；把数据库竞争测试塞进微信包既无法制造真实 Mongo 竞争，也会污染主包和分包。
- 证据：本地公开登录和 Settings 双写回读通过；接收记录 smoke 通过创建、旧正文冲突、追加反馈、结构化墓碑、防复活及同时反馈请求，重试后两条反馈都保留。API 聚焦回归 `71 passing`；微信仍沿用上一门的 `46 files / 171 tests`、TypeScript、ESLint、`140 app / 26 core` 与 production gate 证据，本轮没有新增小程序依赖、插件、媒体或包体。
- 生效范围：微信账号同步的后端运行证据和发布验收清单；不表示真实合法域名、可信 HTTPS、两台物理手机、弱网/断网或匿名 ID 退役已经通过。后续可以用 Skill/CLI 在后台操作开发者工具，但不得置顶、聚焦、抢占窗口或用户输入；本轮未调用开发者工具，未预览、上传、发布、提交或推送。
- 记录：Codex（GPT-5.6），2026-07-20 03:39:34。

### 变动 91：登录前确认匿名设备数据合并

- 意图：让用户决定是否把本机公共沟通数据合并到账号，并避免失败、取消或重复登录造成静默上传和反复打扰。
- 决策：设备新增稳定匿名 `userId`；登录成功后展示可合并数据摘要和隐私说明。确认后才同步，暂缓按账号最多提示三次；完整成功后保存账号关联墓碑。私人图片、纠错和录音不进入账号同步。
- 理由：登录凭据授权与数据上传授权不是同一件事；保留匿名来源并记录关联状态，比删除 ID 或每次询问更安全且可恢复。
- 证据：聚焦 `3 files / 22 tests`，全量 Vitest `47 files / 177 tests`、TypeScript、ESLint、`142 app / 26 CBoard core` 边界与 production quality gate 通过。未压缩 main `296,262 B`、caregiver `1,531,265 B`、backup `1,443,138 B`、OCR `47,964 B`；44 boards / 825 tiles / 775 images 和 3 张紧急资源完整。
- 生效范围：微信账号登录、自动合并提示、手动同步和本机 repository；不上传私人数据，不改变认证 API、图板、matcher、语音或历史编辑。只使用后台命令，没有打开、置顶、聚焦或抢占开发者工具窗口，未预览、上传、发布、提交或推送。
- 记录：Codex（GPT-5.6），2026-07-20 04:14:49。

### 变动 92：常用语逐条版本、冲突和删除墓碑接入账号同步

- 意图：使微信端删除或修改常用语后能够安全跨设备收敛，并对冲突给出可见结果。
- 决策：管理页删除改走共享 repository 并创建本机墓碑；账号同步先提交 pending tombstones，再把活动常用语发送到专用 API，保存服务端版本与冲突标记。旧 Settings 数据只补种缺失记录，兼容镜像不再作为规范来源；完整同步成功后才退役匿名账号关联。
- 理由：先删后传可以避免同一轮同步把刚删除的数据重新上传；逐条版本避免整包覆盖，完整成功才退役则保证部分失败仍可重试。
- 证据：云同步、账号端口和管理聚焦 `3 files / 24 tests`；全量 Vitest `47 files / 181 tests`、TypeScript、ESLint、`142 app / 26 CBoard core` 边界、44 boards / 825 tiles / 775 images 和 production quality gate 全部通过。未压缩 main `296,262 B`、caregiver `1,539,596 B`、backup `1,453,767 B`、OCR `56,920 B`，没有单媒体超过 `200 KiB`；JS/WXML/WXSS 压缩、无依赖过滤和 `lazyCodeLoading: requiredComponents` 均已开启。
- 生效范围：微信常用语管理、账号同步和本地 storage；不迁移私人图片文件，不改变图板、分词、matcher、语音或接收正文。允许后台 Skill/CLI 操作开发者工具，但不得置顶、聚焦、弹到前台或抢占输入；本轮未调用开发者工具，也未预览、上传、发布、提交或推送。
- 记录：Codex（GPT-5.6），2026-07-20 05:13:55。

### 变动 93：官方 Skill E2E 默认禁止管理项目窗口

- 意图：从代码层保证自动化不会打开、关闭、置顶或聚焦微信开发者工具，而不是只依赖操作者记住口头边界。
- 决策：`weapp-skill-smoke.mjs` 默认进入 background-only 模式，先用 `automation_runtime_info` 读取既有运行时；项目未打开就明确失败。只有显式传入 `--allow-window-management` 或 `WEAPP_E2E_ALLOW_WINDOW_MANAGEMENT=1` 才允许旧的开窗、清缓存和重开流程。
- 理由：npm 可能不转发未知 CLI 参数，若“安全”依赖一个可丢失的 `--background-only`，脚本会静默回退到危险默认值。安全行为必须是默认值，危险能力必须显式开启。
- 证据：首次 npm 验证真实暴露参数未传递，并误进入旧窗口流程，第二次打开被工具终止；修复后 `node --check` 通过，直接运行只调用既有运行时查询，并以“不会自动打开或聚焦”明确停止，未再调用 `open_project_window`、`close_project_window`、清缓存、刷新或页面操作。
- 生效范围：官方 Skill 主 E2E 及调用它的账号 E2E；不改变测试场景、storage 快照恢复和生产代码。后续如需完整 E2E，用户可自行保持项目已打开，自动化只在后台接管；预览、上传、发布仍需另行授权。
- 记录：Codex（GPT-5.6），2026-07-20 05:23:46。

### 变动 94：紧急求助拆为自包含独立分包

- 意图：保持紧急求助从患者页和接收页一跳可达，同时避免照护分包在继续开发时突破微信建议包体线。
- 决策：新增 `packages/emergency`；两端入口直接 `navigateTo`，关闭后 `navigateBack`。6 张默认图按稳定 CBoard Tile ID 复制到紧急分包，2 张专用图继续保留本地来源清单；旧跨页 emergency intent 仅作升级兼容。
- 理由：照护分包此前只剩 `33,268 B` 到 1.5 MiB 建议线，安全入口也不应依赖网络或其他分包资源。
- 证据：`47 files / 182 tests`、TypeScript、ESLint、`144 app / 26 core`、production build 和图片清单门全部通过。当前 main `296,378 B`、caregiver `1,520,858 B`、emergency `35,524 B`、backup `1,453,612 B`、OCR `56,920 B`。
- 生效范围：微信紧急页面、导航、图片产物和包体门；不改变 Web、默认板、TTS provider、历史或云同步。后台 E2E 因项目窗口未打开而安全停止，没有开窗、置顶、预览、上传或发布。
- 记录：Codex（GPT-5.6），2026-07-20 06:25:25。

### 变动 95：低频照护工具进入 management 独立分包

- 意图：完整保留图语家的常用语、历史、设置、账号和 AI 检查，又为患者表达与接收理解释放稳定包体余量。
- 决策：新增 `packages/management/pages/index/index`，以 `view=phrases|history|settings` 复用既有管理组件和服务；患者页三个入口只导航。常用语“用于表达”通过一次性 `reuseSavedPhraseId` 返回，患者页再用共享 session 核心恢复图卡序列。旧入口 intent 继续兼容。
- 理由：管理能力低频但代码较重，不应和 775 张默认图片及高频沟通页继续共同增长；独立分包不会牺牲离线表达，也不需要另造 repository 或 API。
- 证据：`47 files / 183 tests`、TypeScript、ESLint、`146 app / 26 core`、production build 和管理分包能力门通过。当前 main `296,510 B`、caregiver `1,478,153 B`、emergency `35,524 B`、management `438,988 B`、backup `1,453,612 B`、OCR `56,920 B`；caregiver 余量 `94,711 B`。
- 生效范围：微信页面分包、照护工具导航和常用语返回；不改变患者表达语义、接收确认、默认板、语音或账号协议。允许 Skill/CLI 后台操作，但不得打开、置顶、聚焦或抢占窗口；本轮 E2E 因项目未打开而安全停止，未预览、上传、发布、提交或推送。
- 记录：Codex（GPT-5.6），2026-07-20 06:46:28。

### 变动 96：患者高频动作改为图标优先且复用共享语义

- 意图：让患者在小程序中不依赖长文字即可识别表达、求助、确认、朗读、调整图片和反馈理解状态。
- 决策：新增轻量 `PatientActionButton`，从 CBoard 纯核心读取动作 ID、glyph、短标签和完整无障碍标签；保留既有 E2E 元素 ID。患者主页、表达序列、候选收尾、常用语全屏、接收全屏、紧急页和返回动作使用该组件；紧急短句继续保留自包含大图按钮并增加明确朗读标签。
- 理由：复制 Material Icons 或引入小程序图标库会增加包体和维护分叉；单字符 glyph 足以建立稳定视觉语言，完整 `ariaLabel` 又不会牺牲辅助功能。
- 证据：Vitest `48 files / 184 tests`、TypeScript、ESLint、`148 app / 26 CBoard core` 边界与 production build 全部通过；生成 JS 保留 `data-patient-action`。未压缩 main `296,510 B`、caregiver `1,484,584 B`、emergency `39,454 B`、management `440,450 B`、backup `1,453,612 B`、OCR `56,920 B`；caregiver 到 1.5 MiB 建议线仍有 `88,280 B`。
- 生效范围：微信患者主页、表达工作区、接收全屏、常用语全屏和紧急页；不改变 matcher、分词、语音、同步、默认板或照护管理流程。开发者工具可以后台操作，但不得打开、置顶、聚焦或抢占窗口；本轮没有运行模拟器 E2E、预览、上传、发布、提交或推送。
- 记录：Codex（GPT-5.6），2026-07-20 07:23:27。

### 变动 97：已保存个人图卡支持编辑和移动板块

- 意图：让照护者在照片保存后仍能修正名称、朗读、关键词、分类和板块，而不必删除后重新录入全部信息。
- 决策：个人图片页的每张独立个人图卡增加“编辑”；表单回填现有名称、朗读、同义词、分类、作者和本机使用说明，可选择另一 CBoard 板块并保存。编辑保留稳定 Tile ID 和原图片；取消或保存失败不修改原图卡。当前不在编辑态换图，避免旧文件仍被表达/历史引用时被误删。
- 理由：只支持新增/删除不能满足 issue #10 的元数据维护验收；复用 CBoard 纯核心的不可变更新函数可同时保证同板顺序、跨板布局和来源说明正确。
- 证据：个人图卡核心 `6/6`、微信全量 `48 files / 186 tests`、TypeScript、ESLint、`148 app / 27 CBoard core`、production build 和逐包质量门全部通过。main `296,510 B`、caregiver `1,484,584 B`、emergency `39,454 B`、management `440,450 B`、backup `1,456,892 B`、OCR `56,920 B`；775 张默认图片完整，无不兼容可选链进入产物。
- 生效范围：微信 backup 分包个人图片页、完整板本机 storage、患者浏览/搜索/matcher/朗读；不包含公开上传、服务端照片、云同步或完整板编辑器。开发者工具可后台操作但不得打开、置顶、聚焦或抢占输入；本轮未预览、上传、发布、提交或推送。
- 记录：Codex（GPT-5.6），2026-07-20 07:46:09。

### 变动 98：照护工具新增个人板块管理

- 意图：允许家属在手机上建立自己的图片分类，并调整患者和照护者看到的板块顺序。
- 决策：照护工具新增“板块管理”，页面放在 `packages/backup` 低频分包；可新建个人板块、修改个人板块名称、将任意板块上移/下移、删除空的个人板块。CBoard 内置板继续由成熟底座提供，微信只允许排序或在显示设置中隐藏，不在低频页面误删；个人板中已有图卡时必须先进入个人图片页移动或删除。
- 理由：这补齐 issue #9 的真实增删排序入口，又避免复制完整 CBoard 编辑器、误删默认图库或把低频 UI 塞进患者主包。
- 证据：共享板块核心 `5/5`、微信定向 `3/3`、全量 `49 files / 187 tests`、TypeScript、ESLint、`151 app / 28 CBoard core` 和 production build 通过。生产 `app.json` 包含 `packages/backup/pages/boards/index`；backup `1,471,369 B`，距 1.5 MiB 建议线 `101,495 B`。
- 生效范围：微信照护工具、backup 分包、本机 BoardDTO 图库和板块浏览顺序；不改变云端账号、默认板内容、个人图片文件、历史或 Web CBoard 原生编辑。开发者工具可后台操作但不得打开、置顶、聚焦或抢占输入；本轮未预览、上传、发布、提交或推送。
- 记录：Codex（GPT-5.6），2026-07-20 08:10:04。

### 变动 99：直接消费共享结构化 AAC 图库

- 意图：让微信小程序能够读取 CBoard Web 导出的结构化 AAC 图库，而不在 Taro 项目中复制完整数据库、React DOM 或 Material UI 编辑器。
- 决策：`pictureLibraryStore` 同时接受 `BoardDTO[]` 与 `PictogramLibraryDTO v1`；读取 storage 时先检测结构化契约，再调用 CBoard 共享纯核心严格校验并恢复 BoardDTO。小程序只补 TypeScript 类型声明和平台 storage 适配，不增加页面、依赖、插件或图片。
- 理由：微信运行时仍应只操作轻量 BoardDTO，但跨端备份和策展需要保留概念、图片来源许可、关系和布局。入口适配可以复用同一事实源，同时避免主包和照护分包继续膨胀。
- 证据：结构化 storage 测试证明板名、图片和同义词经 JSON 持久化后无损恢复；聚焦 `3/3`、全量 `49 files / 188 tests`、TypeScript、ESLint、`151 app / 28 CBoard core` 边界和 production build 全部通过。main `296,552 B`、caregiver `1,488,955 B`、emergency `39,454 B`、management `444,462 B`、backup `1,475,519 B`、OCR `56,920 B`，全部低于 `1.5 MiB`。
- 生效范围：微信本机图片库 storage、患者浏览/搜索/matcher/朗读和未来结构化文件接入；不新增微信完整板编辑器，不改变账号同步、公开上传或默认板内容。开发者工具允许后台操作但不得打开、置顶、聚焦或抢占输入；本轮未调用开发者工具，也未预览、上传、发布、提交或推送。
- 记录：Codex（GPT-5.6），2026-07-21 09:02:09。

### 变动 100：图语家注册复用原项目手机号规则

- 意图：恢复原图语家账号注册中的中国大陆手机号字段，并让用户登录后能确认当前账号绑定的是哪一个脱敏号码。
- 决策：小程序不复制手机号算法，直接通过 `@cboard-communication-core` 复用规范化、11 位校验和掩码校验；注册表单要求填写手机号并发送纯数字，登录响应与本机 session 只保存服务端 `phoneMasked`。cboard-api 仍把手机号设计为可选，保证 CBoard Web 和旧客户端兼容。
- 理由：原 PicInterpreter 已经验证这些规则；平台 adapter 只需要决定“小程序必填、upstream Web 可选”。原始号码不应进入微信 storage，格式/唯一性也不能冒充短信验证。
- 证据：账号端口与 session 定向 `2 files / 21 tests`，微信全量 `64 files / 277 tests`、质量门 `7/7`、TypeScript、ESLint、`184 app / 29 CBoard core`、44 板/825 图卡/775 图片和 production build 全部通过。主包 `1,249,564 B`，距 1.5 MiB 建议线 `323,300 B`；生成前后板 JSON 和 775 张图片聚合 SHA-256 完全一致，仅刷新翻译源 freshness 哈希。
- 生效范围：微信 management 分包账号注册、登录信息和本机 session；不改变患者离线沟通、WechatSI、TTS、分词、matcher、图板或账号同步数据范围。不包含短信验证码、手机号登录或找回密码。没有预览、上传、发布、部署、提交或推送，也没有打开、聚焦、抬升或置顶微信开发者工具或任何窗口。
- 记录：Codex（GPT-5.6），2026-07-22 08:22:37。

### 变动 101：账号注册补齐手机验证码人工确认闭环

- 意图：让小程序注册不再只校验手机号格式和唯一性，而是由用户输入实际收到的验证码后再提交账号。
- 决策：继续复用 `CboardAccountPort` 和 cboard-api，不引入微信云函数、客户端短信 SDK或第二套账号表。进入注册页先读取公开能力配置；配置不可读或生产要求验证但 provider 不可用时失败关闭。发送后按服务端 `resendAfterSeconds` 进行轻量倒计时，六位验证码确认成功后只在组件内存保留一次性令牌；修改手机号、切换登录或注册成功立即清除。
- 理由：短信密钥和验证码不应进入小程序包或 storage；人工确认是原图语家“人可最后修正”的账号版边界。复用服务端契约可以让 Web、微信和未来壳共享同一安全语义，倒计时则避免无意义地触发 429 和短信轰炸保护。
- 证据：账号端口定向 `17 tests`，微信全量 `64 files / 278 tests`、质量门 `7/7`、TypeScript、ESLint、`184 app / 29 CBoard core` 边界和 production build 全部通过。构建门曾真实拦截两处可选链，改为 ES2017 兼容判断后通过。主包 `1,249,564 B`，caregiver `558,907 B`、emergency `91,539 B`、management `491,942 B`、backup `589,688 B`、OCR `62,229 B`，全部低于 1.5 MiB 建议线。
- 生效范围：微信 management 分包账号注册 UI、`CboardAccountPort` 和共享手机号验证核心；不改变患者主包、离线沟通、WechatSI、TTS、分词、matcher、图板或云同步数据范围。当前没有真实短信供应商凭据和手机收码证据，不冒充上线可用。未操作开发者工具、未打开、聚焦、抬升或置顶窗口，未预览、上传、发布、部署、提交或推送。
- 记录：Codex（GPT-5.6），2026-07-22 10:28:30。

### 变动 102：增强状态显示本月服务商 Token 用量

- 意图：让照护者在小程序内确认 AI 增强本月实际用了多少 Token，并看见服务商未回报统计的请求，避免把固定请求点数误解成实际账单。
- 决策：`CommunicationAiPort` 复用 cboard-api 认证 `/gpt/communication/usage`，只归一化月份和非负安全整数；设置页在既有 AI/语音/图片 provider 与点数额度后追加当前月 Token、调用次数和未回报次数。旧 API 没有该接口时忽略用量失败并保留健康状态；不把 breakdown、患者文字、图片或音频写进小程序状态。
- 理由：实际 Token 只能由服务商响应和服务端账本提供，小程序自行分词或按字符估算会与模型计费漂移。复用现有认证 request adapter 只增加一条轻量 JSON 请求，无需新 SDK、组件、插件或媒体。
- 证据：端口聚焦 `8/8`，全量 Vitest `64 files / 279 tests`、质量门 `7/7`、TypeScript、ESLint、`184 app / 29 CBoard core` 边界和 production build通过。构建门真实拦截一次残留可选链，改为显式判断后通过；main `1,249,564 B`、management `493,073 B`，全部包低于 1.5 MiB 建议线。
- 生效范围：微信 management 分包的增强服务状态和 `CommunicationAiPort`；不改变患者表达、接收、WechatSI、TTS、分词、matcher、图片、storage 或请求点数限额。真实 HTTPS API、合法域名、provider usage、Mongo 和手机界面仍待部署后验收；本轮未调用、打开、聚焦、抬升或置顶开发者工具，未预览、上传、发布、部署、提交或推送。
- 记录：Codex（GPT-5.6），2026-07-22 11:48:32。

### 变动 104：缺词 AI 图符只在家属维护中生成并确认

- 意图：当现有 CBoard 图卡、本机家庭图片和公共图库都没有合适候选时，为家属提供一个受控的设备私有补图手段，而不是让患者页自动生图或自动改变匹配结果。
- 决策：直接扩展既有 `CommunicationAiPort`，复用 CBoard 登录 token、`cboard-api` 鉴权/限流/Token 月额度/用量账本和共享 `buildAiGeneratedRuntimePictogram`；不引入客户端 AI SDK。图像模型必须在 API 单独配置。生成 PNG 通过共用 Taro Base64 文件适配器写入 `USER_DATA_PATH`，只在缺图维护显示预览、provider/model 和设备私有说明；确认后才调用既有 `onReview`，放弃、无效响应或保存失败时删除临时文件。
- 理由：模型输出可能语义错误、风格不一致且没有可自动声明的公共许可，必须由照护者逐图核对。复用背景移除已有的本机 PNG 写入模式和缺词私图的恢复删除链，比客户端直连模型、复制 Web UI 或建立第二套图片仓库更小、更安全，也不增加静态包资源。
- 证据：微信 AI port `11/11`、全量 Vitest `75 files / 333 tests`、产物质量门 `7/7`、TypeScript、ESLint、`211 app / 30 CBoard core` 边界和 production build 全部通过。主包未压缩 `1,249,738 B`，距 1.5 MiB 建议线 `323,126 B`；所有分包低于建议线，本次没有新增图片、音频、插件、依赖或 lockfile。构建保留既有 AAC 导入页面 `295 KiB` 单资源警告，属于独立性能债务。
- 生效范围：微信家属接收页中的缺图维护、AI 网络端口、`USER_DATA_PATH` 临时/持久文件和共享设备私有 attribution；不进入患者表达页，不自动采用，不上传公共图库，不声明公共许可，不改变默认板、分词、matcher、语音或账号同步。本轮只在后台测试和构建，未调用、打开、激活、聚焦、抬升或置顶开发者工具，未预览、上传、发布、部署、提交或推送；真实图像模型、合法域名、真机触控、生成质量和患者理解仍待验收。
- 记录：Codex（GPT-5），2026-07-27 00:01:34。

### 变动 103：设置页补齐真实 AI 连接测试

- 意图：让照护者在微信端确认已配置 AI 不是只通过健康字段，而是能够完成一次真实、可控、无患者内容的候选句调用。
- 决策：新增纯编排函数 `runCommunicationAiConnectionTest`，只复用 `CommunicationAiPort.generateSentences` 并固定发送“我、喝水”和 1 个候选；management 设置页增加独立按钮和结果区。只有 API 端口返回非空候选时成功；未登录、未配置、限额、网络和空响应沿用端口有界错误，不回显异常对象。文案提前告知不发送患者文字、图片、历史或场景，一次测试会消耗增强额度并计入 Token 用量。
- 理由：复用现有认证 request adapter、cboard-api 候选句端点和 usage 账本，可以验证完整生产调用链，不需要把 OpenAI SDK、密钥、计量框架或新插件塞进小程序包；独立纯函数也比把请求逻辑写进 Taro 页面更易测试。
- 证据：连接测试与 AI 端口聚焦 `2 files / 11 tests`；全量 Vitest `65 files / 282 tests`、质量门 `7/7`、TypeScript、ESLint、`186 app / 29 CBoard core` 边界和 production build 全部通过。生成的 management JS 包含 `ai-live-test-button`、测试文案和固定词说明；main `1,249,564 B`、caregiver `559,596 B`、emergency `91,539 B`、management `494,791 B`、backup `589,688 B`、OCR `62,229 B`，全部低于 1.5 MiB 建议线。
- 生效范围：微信 management 分包设置页和既有 `CommunicationAiPort`；不改变患者表达、接收、WechatSI、TTS、分词、matcher、图板、storage 或本地回退。真实 HTTPS、合法域名、provider 凭据、Mongo usage 和手机界面仍待部署后验收；本轮未调用开发者工具，未打开、激活、聚焦、抬升或置顶任何窗口，也未预览、上传、发布、部署、提交或推送。
- 记录：Codex（GPT-5.6），2026-07-22 12:21:04。
- 补充记录：Codex（GPT-5.6），2026-07-22 12:38:49；纯连接测试编排恢复原图语家的 10 秒等待上限，provider 不返回时显示有界提示并释放设置页按钮，不改变普通 AI 候选请求或 Taro adapter。聚焦 `2 files / 12 tests`，全量 `65 files / 283 tests`、质量门 `7/7`、TypeScript、ESLint、`186 app / 29 CBoard core`、production build通过；management `495,284 B`，全部包低于 1.5 MiB。构建产物包含超时文案；未调用开发者工具，未打开、激活、聚焦、抬升或置顶窗口，也未预览、上传、发布、部署、提交或推送。

### 变动 105：完整私有数据使用独立账号快照跨设备恢复

- 意图：让家属在微信与 CBoard Web 之间迁移常用语、沟通历史、接收修正、待同步反馈和个人图片，同时保留原“私人图片云备份只含图片”的清晰隐私边界。
- 决策：复用 CBoard 共享 `PictureLibraryArchive v1`、`LocalDeviceData v1`、既有事务恢复、登录 token、Taro 上传下载和 cboard-api 私有 Blob；新增独立 `taroPrivateDeviceDataCloudPort`，命中 `/communication/private-device-data`。compact 快照使用 custom scope 且 manifest 明示 `account-private-snapshot`，不打包 44 个默认板和 775 张默认图。页面只放在照护者低频 backup 分包，上传前列出内容，下载后显示统计并二次确认，删除不影响原私人图片快照。
- 理由：把历史直接混入私人图片 ZIP 会改变既有承诺，上传 full 默认图库又浪费带宽；AsTeRICS AAC 的跨设备同步目标值得参考，但引入 PouchDB/CouchDB 会复制 CBoard 已成熟账号后端。复用现有 ZIP、账号和恢复核心能以更小胶水代码实现可审查、可撤销迁移。
- 证据：云端口与备份服务聚焦 `2 files / 27 tests`；全量 Vitest `75 files / 335 tests`、质量门 `7/7`、TypeScript、ESLint、`211 app / 30 CBoard core` 边界和 production build 全部通过。质量门确认新旧四个私有备份端点都在 backup 分包；未压缩 main `1,249,738 B`、backup `555,192 B`，所有包低于 `1.5 MiB` 建议线，无新增依赖、插件、图片、音频或 lockfile。
- 生效范围：微信“照护设置 → 图片库维护/备份 → 跨设备完整私有数据备份”、compact ZIP 构建、账号上传、元数据、下载检查、复核恢复与独立删除；不进入患者表达页，不改变语音、分词、matcher、默认板、普通 Settings/事件同步、私人图片快照或公共图库。真实 HTTPS/Azure/Mongo、合法域名、两台手机和网络中断仍待部署/真机验收；未调用、打开、聚焦、抬升或置顶开发者工具，未预览、上传、发布、部署、提交或推送。
- 记录：Codex（GPT-5.6），2026-07-27 00:46:11。

### 变动 106：完整私有数据账号快照升级为端侧加密

- 意图：让跨设备完整备份在保留现有 CBoard 账号和恢复核心的同时，服务端无法读取患者沟通、接收修正和个人图片明文。
- 决策：复用 CBoard 共享 `privateArchiveEncryption` 和经审计的 Noble `scrypt + XChaCha20-Poly1305`；微信只补 `Taro.getRandomValues` 与二进制 adapter。照护者输入至少 12 字符的恢复密码并再次确认，密码不写入 storage；上传 `.pijenc` 密文，下载后只在本机解密再复核。旧明文云备份要求原设备重新加密上传。
- 理由：账号鉴权与私有 Blob不是端到端加密；自研密码学或把密码交给 API 都不可接受。共享纯核心可让 Web 与微信保持同一格式，同时不搬运 React DOM、Material UI 或第二套后端。
- 证据：加密 adapter/云端口 `10/10`，全量 Vitest `76 files / 338 tests`、质量门 `7/7`、TypeScript、`213 app / 32 CBoard core` 边界和 production build通过。主包 `1,249,738 B`、backup `584,718 B`，全部单包低于 1.5 MiB 建议线；生成产物真实包含 Noble scrypt 模块。
- 生效范围：微信“图片库维护/备份 → 跨设备完整私有数据备份”、密码内存状态、Taro CSPRNG、加密上传/下载和旧备份提示；本变动当时不改变私人图片 ZIP（后由变动 107 独立升级）、本机 ZIP、默认板、患者表达、语音、分词、matcher 或普通同步。未操作、打开、聚焦、置顶开发者工具，未预览、上传、发布、部署、提交或推送。
- 记录：Codex（GPT-5.6），2026-07-27 01:42:32。

### 变动 107：私人图片账号快照升级为端侧加密

- 意图：让家属只备份个人换图和缺词私图时，也能保证 API 与对象存储只接触密文，而不是因为内容少于完整私有数据就降低隐私等级。
- 决策：复用变动 106 的共享 `privateArchiveEncryption`、Noble `scrypt + XChaCha20-Poly1305`、`Taro.getRandomValues` 和 `PIE2EE01` 信封；页面为私人图片快照提供独立恢复密码和确认输入。上传先构建现有 custom `PictureLibraryArchive v1` ZIP，再在设备内加密并发送 `.pijenc`；下载先在设备内解密，再进入既有检查、复核和事务恢复。私人图片与完整私有数据继续使用独立端点、格式、密码状态和删除动作；旧明文图片快照提示回原设备重新加密，仍可删除但不能恢复。
- 理由：私有 Blob不等于端到端加密，家庭照片同样属于高敏感信息；复用现有纯核心比新增微信专用格式或自研密码学更可审计。保留两个独立快照则不会把历史、修正和反馈混入用户只选择图片备份的操作。
- 证据：私人图片云端口与 Taro 加密 adapter 聚焦 `2 files / 11 tests`；全量 Vitest `76 files / 339 tests`、TypeScript、ESLint、`213 app / 32 CBoard core` 边界、图片清单 `44 boards / 825 tiles / 775 images` 与质量门 `7/7` 全部通过。production build 成功，未压缩 main `1,249,738 B`、backup `586,403 B`，所有单包低于 1.5 MiB 建议线；无新增依赖、插件、图片、音频或 lockfile。
- 生效范围：微信“照护设置 → 图片库维护/备份 → 跨设备私人图片备份”的密码内存状态、端侧加密上传、端侧解密复核、旧明文迁移提示与独立删除；不进入患者表达页，不改变本机 ZIP、完整私有数据快照、默认板、语音、分词、matcher、AI 或普通同步。真实 API/Azure/Mongo/合法域名、两台真机、错误密码、密文篡改、弱网和低内存 KDF 延迟仍需运行验收；本轮未操作、打开、聚焦或置顶开发者工具，未预览、上传、发布、部署、提交或推送。
- 记录：Codex（GPT-5.6），2026-07-27 02:19:50。

### 变动 108：issue #83 图卡排序进入官方模拟器运行门

- 意图：把“固定人工顺序 / 常用优先”从代码、单测和生产构建证据推进到微信官方模拟器中的真实照护设置、患者点图与页面重建闭环。
- 决策：不新增排序算法或第二套自动化框架，继续复用 CBoard 共享 `pictogramOrdering`、微信 storage adapter 和既有官方 Skill smoke。新增 `WEAPP_E2E_ORDERING_ONLY=1` 专用模式；运行前快照全部微信 storage，并把排序状态纳入确定性隔离，运行后逐项恢复原值。场景通过稳定元素 ID 完成“是”下移、患者点选、切换常用优先、重建页面、切回固定顺序和再次重建。
- 理由：单测无法证明 Taro 事件、management 分包导航、页面 `onShow` 重载、真实微信 storage 与渲染顺序能共同工作；复制 Automator 或使用坐标点击又会制造脆弱测试。复用现有官方 Skill harness 可以验证 production 产物，同时保持用户数据可恢复且不操作窗口层级。
- 证据：微信开发者工具 Nightly `2.02.2607252` 后台运行通过；自动化确认默认“是、不”，人工下移后为“不、是”，患者点“是”后 `root:HJVQMR9pX5F-` 计数为 `1`，常用优先恢复“是、不”，且首个导航文件夹始终保持第 3 位；两次 `reLaunch` 后偏好、人工顺序和计数均持久化，最终恢复原 19 项 storage。TypeScript、ESLint、`213 app / 32 CBoard core` 边界、`76 files / 339 tests`、质量门 `7/7` 和 production build 全部通过；主包 `1,249,738 B`，所有单包低于 1.5 MiB 建议线。
- 生效范围：微信图卡排序官方模拟器证据、Skill smoke storage 隔离和 `test:e2e:weapp:ordering` 命令；不改变排序业务语义、默认板、matcher、TileDTO、账号同步、图片、语音或 API。物理手机触控仍待真机验收；本轮没有预览、上传、发布、部署、提交或推送，也没有打开、激活、聚焦、抬升或置顶开发者工具窗口。
- 记录：Codex（GPT-5.6），2026-07-27 06:49:04。

### 变动 109：issue #13/#23 会话与照护场景进入官方模拟器运行门

- 意图：证明“医院/家庭/康复门诊”场景和“新对话”不只是纯核心或单测能力，而是在微信真实页面、分包导航和 storage 重建中保持同一会话语义。
- 决策：不新增 session、场景或历史算法，继续复用 CBoard 共享 `conversationSession`、微信 communication repository、Taro `showModal` 和既有官方 Skill smoke。新增 `WEAPP_E2E_SESSION_ONLY=1` 专用模式，以真实患者确认建立旧会话历史，再执行医院场景选择/同键清除/重新选择、页面重建、取消新对话、确认新对话和再次重建；运行前后继续使用完整 storage 快照恢复。
- 理由：组件测试不能证明患者页与接收分包共用同一活动 session，也不能证明取消确认、场景持久化、旧历史保留和新工作区清空在微信运行时同时成立。复用现有 Skill harness 比复制 Automator、坐标点击或新增测试页面更小且更可靠。
- 证据：微信开发者工具 Nightly `2.02.2607252` 后台 E2E PASS：旧会话确认一条患者表达并写入当前 session；医院场景立即激活，`reLaunch` 后保持；同键清除和恢复均不改变 session；取消新对话后 session、医院场景和历史完全不变；确认后 session ID 改变、场景消失、接收输入和患者图片序列为空，旧历史仍原样保留，第二次 `reLaunch` 后继续成立。脚本最终恢复原 19 项 storage。TypeScript、ESLint、`213 app / 32 CBoard core` 边界、`76 files / 339 tests` 和质量门 `7/7` 全部通过；沿用同轮成功 production build，主包 `1,249,738 B`。
- 生效范围：微信 #13 新对话和 #23 固定照护场景的官方模拟器证据、Skill smoke 及 `test:e2e:weapp:session` 命令；不改变历史 schema、AI payload、matcher、图卡、语音、账号同步或 API。真实登录模型消费场景仍需部署后验收；本轮未预览、上传、发布、部署、提交或推送，也未打开、激活、聚焦、抬升或置顶开发者工具窗口。
- 记录：Codex（GPT-5.6），2026-07-27 06:57:30。

### 变动 110：issue #12 候选反馈完成官方模拟器运行闭环

- 意图：证明微信候选句“有帮助/不符合”不只是按钮和 storage 字段，而能完成草稿、确认历史和照护复盘，并在页面重建后保持事实一致。
- 决策：继续直接编译 CBoard 共享 `CandidateFeedback v1`，新增的恢复函数按会话、输出签名和候选句文本选择最新有效草稿；Taro 只从既有 repository 读取并向 `ExpressionWorkspace` 注入，不复制匹配算法。官方 Skill smoke 增加 `WEAPP_E2E_FEEDBACK_ONLY` 专用模式，将候选反馈草稿 key 纳入确定性隔离和原 storage 快照恢复。
- 理由：只断言 JSON 落盘不能证明按钮切换、同 ID 更新、取消删除、确认迁移和历史改评共同可用；按句子而非下标恢复又能避免 AI 候选变化后把旧评价贴错。复用原 Skill harness 和共享核心比新建测试小程序、测试页面或微信专用 schema 更小、更可靠。
- 证据：TypeScript、ESLint、`213 app / 32 CBoard core` 边界、`76 files / 339 tests`、质量门 `7/7` 和 production build 全通过；未压缩 main `1,249,738 B`，全部分包低于 `1.5 MiB` 建议线。微信开发者工具 Nightly `2.02.2607252` background-only E2E PASS：草稿创建、同 ID 从 up 换为 down、再次点击取消并删除、重新评价后确认写历史、重建历史页后 up 高亮、改为 down 后第二次重建仍保留；结束恢复原 19 项 storage。
- 生效范围：微信患者候选反馈、照护历史复盘、共享纯核心类型和官方 E2E 命令；不改变反馈 schema、候选生成、WechatSI/TTS、账号 API、云同步、分词、matcher 或图卡。模拟器不替代物理手机触控、真实播报并行或部署后登录同步；未预览、上传、发布、部署、提交或推送，全程没有打开、激活、聚焦、抬升或置顶开发者工具窗口。
- 记录：Codex（GPT-5），2026-07-27 07:27:25。

### 变动 111：issue #22 历史接收修正进入官方模拟器运行门

- 意图：证明照护者可以在微信正式历史管理页选择任意已确认接收记录修正图片，并且患者原始记录、修订证据和重建后的最新投影保持一致。
- 决策：继续复用 CBoard 共享 `receiverLifecycle`、`ReceiverCorrection v1`、微信 repository/storage adapter 和既有官方 Skill smoke；新增 `WEAPP_E2E_HISTORY_REVIEW_ONLY=1` 与 `test:e2e:weapp:history-review`，不复制纠错逻辑。场景使用两条已确认接收记录并修正较旧一条；由于官方 Automator 无元素索引且 Taro 会改写嵌套动态 ID，测试从官方 `outerWxml` 按可见“换图”文字和 CBoard“是”图片解析当前运行时 ID，再调用官方点击。
- 理由：单元测试不能覆盖分包路由、图片目录、Taro 事件、React 投影、微信 storage 与 `reLaunch`；坐标点击、重复静态 ID或新增测试页都会比读取正式 WXML 更脆弱。不可变基线必须在 repository 首次规范化和图符署名补齐后建立，才能区分合法迁移与错误覆盖。
- 证据：Nightly `2.02.2607252` background-only E2E PASS：较旧记录从“不”图换为“是”图，唯一追加 `caregiver_history_review` correction，前后图符 ID和完整 revision 快照正确，规范化后的两条原历史不变，唯一修订提示可见，`reLaunch` 后目标记录仍投影“是”图且审计不重复，原 19 项 storage 最终恢复。TypeScript、ESLint、`213 app / 32 CBoard core` 边界、`76 files / 339 tests`、质量门 `7/7` 和 production build 通过；main `1,249,738 B`，所有单包低于 1.5 MiB。
- 生效范围：微信照护历史接收修正运行证据、官方 Skill 专用模式和 npm 命令；不改变患者原始词、纠错 schema、CBoard Web、matcher、AI、语音、账号或 API。物理手机触控、真实登录同步、弱机重启和连续多次修订仍需外部验收；未预览、上传、发布、部署、提交或推送，也未打开、激活、聚焦、抬升或置顶开发者工具窗口。
- 记录：Codex（GPT-5），2026-07-27 08:16:15。

### 变动 112：issue #29 表达保存失败进入官方模拟器运行门

- 意图：证明微信本地存储失败不会清空患者正在表达的图片和候选，也不会把失败误标成已确认，并且恢复后可在原位置重试。
- 决策：不修改产品代码，继续复用共享 `persistExpressionHistoryEntry`、微信 repository adapter 和 background-only Skill smoke；新增 `WEAPP_E2E_STORAGE_FAILURE_ONLY=1` 与 `test:e2e:weapp:storage-failure`。场景先真实点选“是”，仅在确认阶段通过官方 `automation_wx_api` mock 令 `wx.setStorageSync` 抛出配额错误，验证现场后恢复原 API 并重试。
- 理由：组件/纯函数测试不能证明 Taro Button、React 状态、Wechat storage adapter 与 repository 异常边界共同工作；历史保存失败不应升级为患者沟通内容丢失。官方 wx mock 比复制 storage 实现或新增测试页更接近真实平台接口。
- 证据：Nightly `2.02.2607252` background-only E2E PASS：失败后 history 为空，一张“是”图、全部候选、当前选句和启用的确认按钮都保留；恢复 storage 后同一按钮成功写入唯一确认表达，再次点击不重复。原 19 项 storage 最终恢复。微信 `76 files / 339 tests`、质量门 `7/7`、TypeScript、ESLint、`213 app / 32 core` 和 production build 同轮通过。
- 生效范围：微信表达确认的 storage 异常与原地重试运行证据、官方 Skill 专用命令；不改变 UI 文案、表达/历史 schema、候选、语音、matcher、账号、API 或 Web。真机低存储、系统级配额与弱机压力仍待外部验收；未预览、上传、发布、部署、提交或推送，也未打开、激活、聚焦、抬升或置顶开发者工具窗口。
- 记录：Codex（GPT-5），2026-07-27 08:22:55。

### 变动 113：隐藏板块同步过滤患者导航入口

- 意图：照护者在图片库维护中隐藏板块后，让患者页同时移除该板块及所有指向它的文件夹入口，避免出现仍可点击但目标已隐藏的孤儿导航。
- 决策：微信不复制过滤算法，直接复用 CBoard 纯核心 `projectVisibleCommunicationBoards`；核心统一过滤 BoardDTO、`loadBoardId/loadBoard` 导航图卡、`layout.tileIds` 和兼容 `grid.order`，患者页只消费投影。官方 E2E 刷新前仅清目标项目的 compile cache，不清用户 storage。
- 理由：只隐藏板块列表不能封闭患者导航；双平台各写一套 BoardDTO 修补会产生语义漂移。开发者工具可能在新 dist 已生成后继续运行旧编译，`cleanCompileCache` 是比反复改业务代码更准确的恢复边界。
- 证据：微信 `77 files / 342 tests`、质量门 `7/7`、TypeScript、ESLint、`214 app / 32 CBoard core` 边界和 production build 全通过，全部单包低于 1.5 MiB。Nightly `2.02.2607252` background-only E2E PASS：默认文件夹可见，隐藏后文件夹消失且叶子图卡保留，`reLaunch` 后保持，恢复后文件夹重新出现，原 19 项 storage 最终恢复；CBoard 对应核心/Web `2 suites / 29 tests` 与 production build 同轮通过。
- 生效范围：微信患者页、照护图片库维护和共享板块投影；不删除数据、不改 matcher、分词、语音、AI、账号或 API，全部隐藏时保留既有安全回退。未预览、上传、发布、部署、提交或推送，也未置顶开发者工具窗口。
- 记录：Codex（GPT-5），2026-07-27 12:09:31。

### 变动 114：跨分类找图只在家属图片库维护的运行门

- 意图：用官方运行时证明患者表达页不再承载跨分类维护工具，而家属仍能从照护设置进入完整图片库并查询 CBoard 图卡。
- 决策：复用正式 `CommunicationSettingsPanel`、`PersonalImageManager` 和 background-only Skill smoke，新增 `test:e2e:weapp:library-placement`；不新增测试页，不复制图库搜索。场景检查患者页隔离、正式分包路由、公开图卡收纳与“叉子”跨分类结果。
- 理由：源码断言不能证明 Taro 路由和真实目录搜索共同工作；维护模块放在患者页会增加操作复杂度并重现图片堆叠。
- 证据：Nightly `2.02.2607252` 后台 E2E PASS，患者页无搜索入口和维护文案，照护设置进入图片库维护后可见两个维护模块并返回真实“叉子”图卡，原 19 项 storage 恢复。同期 `77 files / 342 tests`、质量门 `7/7`、TypeScript、ESLint、`214 app / 32 core`、production build 全通过。
- 生效范围：微信患者页与家属图片库维护的入口边界和运行证据；不改变业务搜索、图卡、语音、AI、账号或 API，不冒充真机触控通过。未预览、上传、发布、部署、提交或推送，也未置顶开发者工具窗口。
- 记录：Codex（GPT-5），2026-07-27 12:23:02。

### 变动 115：离线状态下双向沟通进入官方模拟器运行门

- 意图：证明微信报告离线时，本地图板、患者表达、照护接收、全屏确认和双向历史不是只在单元测试中可用。
- 决策：复用微信 `getNetworkType`、共享纯核心、完整 CBoard 图包和既有 repository；新增 `test:e2e:weapp:offline`，只 mock 官方支持的初始网络类型，不复制网络实现。通用 wx mock 只在成功后登记恢复项。
- 理由：离线文案与沟通主链分开测试不能证明用户真的可以断网沟通；官方不允许 mock `onNetworkStatusChange`，因此不伪造运行中切换事件。
- 证据：后台 E2E PASS：患者首屏不显示技术提示，照护工具与接收页显示离线模式；患者“是”和照护“想喝水”均完成确认，接收全屏为 3 图，双向历史 2 条并跨 `reLaunch` 恢复，真实 wx API 与原 19 项 storage 恢复。网络端口 `4/4`、全量 `77 files / 342 tests` 和质量门 `7/7` 同轮通过。
- 生效范围：官方模拟器初始离线状态与本地沟通；不冒充真机断网、网络切换、外部请求阻断或离线 ASR 已通过。未预览、上传、发布、部署、提交或推送，也未置顶开发者工具窗口。
- 记录：Codex（GPT-5），2026-07-27 12:36:43。

### 变动 116：微信官方性能配置与 AAC 分包重新验收

- 意图：在继续补功能前确认现有小程序不会因包体、静态资源、压缩配置或伪动态加载方案降低微信发布质量。
- 决策：继续复用当前独立 AAC 导入分包和成熟解析器，不为消除 Webpack 通用 `244 KiB` 单资源提示引入可能影响微信审核的动态加载插件。生产构建继续自动检查 JS/WXML/WXSS 压缩、未使用文件过滤、`lazyCodeLoading=requiredComponents`、插件真实调用、未使用组件、1.5/2 MiB 单包门和 200 KiB 媒体门；插件下载体积保留为官方性能扫描人工门。
- 理由：Taro 在微信小程序端默认把动态 `import()` 转为同步 `require`，社区运行时方案存在审核风险；当前 AAC 分包只有 `625,556 B`，距 1.5 MiB 建议线尚有 `947,308 B`，拆散解析流程会增加维护成本而不改善核心沟通。
- 证据：开发者工具 Nightly `2.02.2607252` 兼容；质量门 `7/7`、TypeScript、ESLint、`214 app / 32 core` 边界与 production build 全通过。main `1,249,738 B`，其余六个分包均低于 626 KiB，775 张共享图卡仅在主包出现一次，AAC 分包不含静态图片或音频。
- 生效范围：微信生产包、AAC 导入和发布前性能验收；不改变患者表达、照护接收、分词、matcher、图卡、语音、账号、API 或 Web。尚未运行官方上传性能扫描，未预览、上传、发布、部署、提交或推送，也未打开、聚焦或置顶开发者工具窗口。
- 记录：Codex（GPT-5），2026-07-27 12:53:13。

### 变动 117：个人图卡支持复制到多个 CBoard 并完成官方模拟器闭环

- 意图：落实图语家 PRD 中“同一张图卡可以出现在多个图板”的要求，让家属不必重复选图、填写元数据或录音，也不会因为删除其中一份而破坏另一块板的沟通内容。
- 决策：纯业务层直接复用 CBoard `BoardDTO / TileDTO`、设备私有图符归因和不可变图板更新契约，新增 `copyPersonalPictogramToBoard`；复制结果生成新的 Tile ID，但沿用同一图片、录音、沟通元数据和 `originalId`。微信只在低频“家属设置 → 图片库维护”增加目标板选择与复制按钮；删除或编辑媒体前通过共享引用检查保护仍被其他板使用的本机文件。官方 Skill smoke 增加 `WEAPP_E2E_PERSONAL_CARD_COPY_ONLY=1` 专用模式，不复制自动化框架或建立测试页面。
- 理由：CBoard 原生 Board/Tile 模型已经支持一块板各自持有 Tile，图语家真正缺少的是“多板引用同一家庭媒体”的薄语义层；复制二进制会浪费微信空间，复用同一 Tile ID 又会破坏布局身份和后续单板编辑。新 Tile ID 加共享媒体既保留 CBoard 结构，也能安全管理本机文件生命周期。
- 证据：CBoard 聚焦 `1 suite / 9 tests`、ESLint 和 production build 通过；微信定向 `1 file / 7 tests`、全量 `77 files / 343 tests`、质量门 `7/7`、TypeScript、ESLint、`214 app / 32 CBoard core` 边界和 production build 全部通过。未压缩 main `1,249,738 B`、backup `591,710 B`，其余分包均低于 1.5 MiB。Nightly `2.02.2607252` background-only E2E PASS：从真实家属图片库复制后源/目标 Tile ID 不同但图片、声音和来源 `originalId` 相同；删除源卡后目标卡及共享媒体保留；`reLaunch` 后目标卡恢复；最后原样恢复用户的 19 项 storage 和图板双槽文件。首次用完整 44 板夹具触发 MCP 参数 `500`，缩到同一真实流程所需的首页与快速交流两块板后通过，未降低业务断言。
- 生效范围：CBoard Web/Electron/Cordova 与微信共享的个人图卡复制纯核心、微信家属图片库维护、设备私有媒体引用保护和专用 E2E；不进入患者表达首屏，不改变默认板、公开图库、matcher、分词、TTS、AI、账号同步或 API。模拟器不替代物理手机上的 Picker、滚动、触控、录音文件和低存储验收；未预览、上传、发布、部署、提交或推送，也未打开、激活、聚焦、抬升或置顶开发者工具窗口。
- 记录：Codex（GPT-5），2026-07-27 13:40:58。

### 变动 118：个人板块管理入口修复并完成官方模拟器闭环

- 意图：让家属能持续维护个人分类，而不是只在“尚无个人板”时进入一次；并证明新建、改名、排序、板间导航和安全删除确实能服务患者表达页。
- 决策：继续复用 CBoard 共享 `boardManagement`、`BoardDTO / TileDTO` 和图片库双槽存储，不复制完整 Web 编辑器。把图片库中的“打开板块管理”从无个人板时的条件入口改为始终可见；为正式按钮补稳定 ID；官方 Skill 新增 `WEAPP_E2E_BOARD_MANAGEMENT_ONLY=1` 专用模式，使用首页与快速交流两块真实默认板完成个人板全生命周期和患者导航。
- 理由：首次 E2E 在第二次返回图片库时找不到入口，源码证明确实只在 `personalBoards.length === 0` 时渲染按钮；这会让创建第一块板后的改名、排序、跳转和删除成为不可达功能。保持同一个长期入口比增加隐藏手势、测试专用路由或复制 CBoard 设置页更清楚、更可维护。
- 证据：首轮 E2E 已通过新建、改名、排序、首页加入口和患者进入，随后在真实入口消失处失败，并在 `finally` 恢复原 19 项 storage 与图库文件。修复后聚焦 `2 files / 4 tests`、全量 `77 files / 343 tests`、质量门 `7/7`、TypeScript、ESLint、`214 app / 32 CBoard core` 边界与 production build 全通过；backup `591,947 B`。Nightly `2.02.2607252` background-only E2E PASS：新建“E2E 家庭板”、改名、上移、首页加入文件夹、患者打开、移除入口、确认删除空板并 `reLaunch` 检查清理，最后再次恢复原数据。
- 生效范围：微信“家属设置 → 图片库维护 → 板块管理”、个人板新增/改名/排序/板间入口/删除和患者导航；CBoard Web 继续使用原生成熟板编辑器。不会允许删除内置板或含图卡/跳转的个人板，不改变 matcher、分词、语音、AI、账号或 API。模拟器不替代物理真机输入法、长列表滚动和触控；未预览、上传、发布、部署、提交或推送，也未打开、激活、聚焦、抬升或置顶开发者工具窗口。
- 记录：Codex（GPT-5），2026-07-27 13:57:22。

### 变动 119：首次引导与无障碍偏好完成官方模拟器闭环

- 意图：证明共享首次使用引导和高对比、字号、图卡列数不只是静态文案或 CSS，而能在微信正式页面中保存、重建并由照护者再次打开。
- 决策：继续复用 CBoard `COMMUNICATION_ONBOARDING_CONTENT`、`CommunicationPreferences` 和微信 storage adapter；只为开始、重看、高对比、字号和列数按钮增加稳定 ID，并在既有 background-only Skill harness 中增加 `WEAPP_E2E_ACCESSIBILITY_ONLY=1`。场景不复制引导内容、不新增设置 schema 或 UI 框架。
- 理由：组件测试不能证明管理分包、返回患者页、Taro `useDidShow`、页面 class 和 `reLaunch` 共同消费同一偏好；共享核心与正式页面的运行门比新建测试页面、读取源码字符串或手工观察更可靠。
- 证据：聚焦 `2 files / 2 tests`、全量 `77 files / 343 tests`、质量门 `7/7`、TypeScript、ESLint、`214 app / 32 CBoard core` 边界与 production build 全通过；main `1,249,738 B`、caregiver `575,873 B`、management `525,099 B`，全部包低于 1.5 MiB。Nightly `2.02.2607252` background-only E2E PASS：首次显示三步共享引导，完成后持久化；高对比、超大字号和两列网格立即进入患者页，`reLaunch` 后保持；照护设置重看引导只重置完成标记，不丢无障碍偏好，再次完成后恢复正常页面；原 19 项 storage 最终恢复。
- 生效范围：微信患者页首次引导、照护设置重看入口、高对比、字号、图卡列数和偏好重建；CBoard Web 继续复用同一内容与偏好语义。模拟器不能证明系统读屏、色觉对比标准、物理屏幕可读性、安全区或触控；未预览、上传、发布、部署、提交或推送，也未打开、激活、聚焦、抬升或置顶开发者工具窗口。
- 记录：Codex（GPT-5），2026-07-27 14:06:27。

### 变动 120：复用 CBoard 默认板补齐成人照护核心词与修正澄清

- 意图：在不另造第二套图库和分类体系的前提下，让患者从默认首页直接表达高频需要、求助、身体不适和沟通修正，并让微信与 CBoard Web 使用同一份内容和匹配元数据。
- 决策：保留 CBoard 全部成熟默认板和分类，在首页及快速交流中追加图语家 PRD 明确要求的成人照护直达项，并新增隐藏的“核心词”和“修正澄清”子板。图卡优先复用原图语家 `public/seed/pictograms.json` 已审阅的 ARASAAC 编号及 CBoard 既有 Mulberry/CBoard 图符；微信继续由生成器转换同一 `boards.json`，不复制业务内容。公开图只保存紧凑 provider/originalId，运行时统一派生作者、许可和来源链接。
- 理由：CBoard 原始 44 板覆盖面成熟，但首页只提供“是/不”和分类入口，不能满足图语家成人照护中“要/不要/帮帮我/停止/再说一次/疼痛/不舒服/喝水/厕所/医生/家人”的低步骤表达，也缺少沟通失败后的修正语句。复用现有板树并做非破坏扩展，比自研新图库、替换默认板或在微信单独维护 fixture 更可靠。`要不要` 被显式加入排除规则，避免新增“要/不要”后把疑问句误当否定或局部匹配。
- 证据：CBoard 默认内容从 44 板/825 图卡扩展为 46 板/871 图卡，首页 42 项中有 13 个可直接表达项，新增核心词 15 项、修正澄清 9 项和 23 个原图语家已审阅 ARASAAC 源图；CBoard communicationSupport `77 suites / 610 tests`、新增文件 ESLint 零告警和 production build 通过。微信生成 798 张去重 PNG，`77 files / 344 tests`、质量门 `7/7`、TypeScript、ESLint、`214 app / 32 CBoard core` 边界和 production build 全部通过；main `1,282,746 B`，全部七个包低于 1.5 MiB。
- 生效范围：CBoard Web/Electron/Cordova 默认板、共享 matcher/归因，以及微信患者板、接收匹配和离线图包；不删除或改名原 CBoard 分类，不改变账号/API/AI/语音/支付，也不把构建结果冒充为物理真机触控或患者理解研究。现有 vendored AACProcessors 构建警告保持原样且不属于本批新增。未预览、上传、发布、部署、提交或推送，也未打开、聚焦、抬升或置顶开发者工具窗口。
- 记录：Codex（GPT-5），2026-07-27 14:49:20。

### 变动 121：成人照护默认板完成官方模拟器运行闭环

- 意图：证明新增默认内容不只是 JSON、单元测试和构建产物，而能通过微信正式患者页、板间导航、接收匹配、独立全屏和图符署名形成运行闭环。
- 决策：复用现有 background-only 官方 Skill harness、正式路由和完整 storage 快照，新增 `test:e2e:weapp:adult-care-defaults` 专用场景；不新建测试页面、不注入第二套图板、不绕过 matcher。场景检查首页直达图卡，进入核心词与修正澄清子板，再以“要不要叫医生”验证排除规则，并以“叫医生”完成全屏和 ARASAAC 许可展示。
- 理由：单元测试无法证明 Taro Button、板间导航、生成图片路径、React 状态、接收页和独立全屏共同消费同一默认板；只验证“叫医生”也不能暴露新增“要/不要”可能造成的高风险局部误匹配。复用现有官方 Skill 框架能获得更强证据，同时保持用户 storage 和窗口状态安全。
- 证据：Nightly `2.02.2607252` background-only E2E PASS：患者首页 11 个新增直达叶子以及核心词/修正澄清入口均可达；核心词 15 项、修正澄清 9 项可见并可选；“要不要叫医生”仅显示一张“请叫医生”图且不存在“要/不要”图；“叫医生”为 `1/1` 并进入独立全屏，显示 ARASAAC 和 `CC BY-NC-SA 4.0`；原 19 项 storage 最终恢复。
- 生效范围：微信患者默认板、照护接收、板间导航、独立全屏、公开图符署名和专用官方 Skill 命令；不改变业务 schema、CBoard Web、账号/API/AI/语音，也不代表物理真机滚动、触控、横竖屏、读屏或患者理解已验收。未预览、上传、发布、部署、提交或推送，未打开、激活、聚焦、抬升或置顶开发者工具窗口。
- 记录：Codex（GPT-5），2026-07-27 14:59:17。

### 变动 122：同源成人照护默认板完成 CBoard Web 三视口离线闭环

- 意图：确认选择 CBoard 作为全平台底座后，同一份成人照护内容在 Web production 中也能通过真实图板、路由、断网接收和全屏署名，而不是只在微信可用。
- 决策：不复制微信 E2E 或默认板 fixture，直接扩展 CBoard 已有 production offline Playwright 体系；复用真实 `boards.json`、Service Worker、Tile、Router 和 Communication Support。只抽取已有 Service Worker helper，并新增成人默认板独立场景。
- 理由：跨平台复用必须由两端正式页面共同证明；仅有纯核心测试无法发现 Web 路由、Material UI Portal、生产缓存或视口布局问题。沿用 CBoard 自己的成熟测试壳，比再造跨端 UI 自动化层更小且更可靠。
- 证据：桌面 Chrome、Pixel 5 竖屏、Pixel 5 横屏 production 离线场景 `3/3 PASS`：42 项首页、11 个新增直达叶子、15 项核心词、9 项修正澄清、否定疑问安全匹配、医生全屏和 ARASAAC 许可全部成立；原完整离线主链在 helper 抽取后另行 `3/3 PASS`。新增/重构 Playwright 文件语法、ESLint 和 diff check 通过。
- 生效范围：CBoard Web/Electron/Cordova 的成人默认板 production 运行证据和 Playwright helper；微信运行证据继续由变动 121 独立承担。不改变业务代码、默认板数量、API、账号、AI 或语音，也不代表物理设备和患者理解已验收。未预览、上传、发布、部署、提交或推送。
- 记录：Codex（GPT-5），2026-07-27 15:09:08。

### 变动 123：AAC 导入改用 ZIP 平台端口并完成包体减重

- 意图：保留完整 Gridset 导入能力，同时避免 Web 专用 JSZip 被带入微信主包和 AAC 页面，为后续 AAC 格式扩展留出空间。
- 决策：共享 CBoard 核心只接收受限只读 ZIP adapter；Web 使用 JSZip，微信复用既有 fflate；AACTools resolver 只依赖纯符号引用解析；开启 Taro 官方 `mini.optimizeMainPackage`。动态 `import()` 未产生预期异步块的实验已撤回。
- 理由：ZIP 解包是平台差异，Gridset 转 Open Board 才是共享语义。显式端口可以复用同一解析核心与安全限制，又不要求微信承担 Web 依赖。
- 证据：Analyzer 不再包含 `jszip` 或根目录 `9778.js`；main `1,285,089 B`，AAC 分包由 `652,021 B` 降至 `554,555 B`。微信 `83 files / 365 tests`、质量门 `10/10`、TypeScript、ESLint、`229 app / 32 core` 边界和 production build 全通过；CBoard `205 suites / 1435 tests / 72 snapshots` 全通过。
- 生效范围：微信 AAC 导入分包、CBoard Gridset 共享核心和 Web Gridset adapter；不改变患者表达、接收、图板、matcher、分词、语音、账号或 API。插件下载体积仍需上传前由微信官方性能扫描确认；未预览、上传、发布、部署、提交或推送，也未打开、聚焦或置顶开发者工具。
- 记录：Codex（GPT-5.6），2026-07-28 22:01:33。

### 变动 124：图库备份恢复的声音与视频总量门修复

- 意图：修复跨设备图库恢复中声音未累计、视频同时占用两套额度的真实安全缺陷。
- 决策：继续复用 `PictureLibraryArchive v1`、fflate、restore session 和现有 5/20 MiB 声音、8/40 MiB 视频上限；声音和视频分别累计，不新增格式、依赖或 UI。
- 理由：媒体归档、签名检查和事务回滚均已成熟，缺陷只是声音累计语句落在视频分支；最小修复能保持所有既有兼容性。
- 证据：真实压缩 ZIP 回归证明超过 20 MiB 的 5 段 MP3 被拒绝并保留本机板，21 MiB 的 3 段 MP4 可成功恢复。聚焦 `22/22`、全量 `83 files / 367 tests`、质量门 `10/10`、TypeScript、ESLint、`229 app / 32 core` 和 production build 通过；main `1,285,089 B`、backup `649,483 B`。
- 生效范围：微信普通图库、完整本机和端侧加密私有快照解密后的恢复；不改变导出、单文件限制、CBoard Web、患者 UI、账号或 API。未预览、上传、发布、部署、提交或推送，未使用 Computer Use，也未置顶开发者工具。
- 记录：Codex（GPT-5.6），2026-07-28 22:46:55。

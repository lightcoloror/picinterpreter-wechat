# 常用语情境跨页回归

本轮围绕一个问题：**在快捷页选定生活情境后，进入全部列表、搜索、查看整句再返回，选择和表达是否保持不变？**

沿用已有 readability 脚本的官方开发者工具调用、合成资料、选择器和存储比较。只借鉴 concept-map-webapp-builder 的“焦点问题→状态关系→证据”方法，不安装技能或另建可视化工作台。产品基线为上游 `7bb101d4a114c2906f26990f2ecefba7fb27d9cd`，已包含维护者的情境解码修复；本轮不重复修改该实现。

## 状态与验收

```mermaid
flowchart LR
  A[快捷页：选择情境] -->|真实点击查看全部，携带情境| B[管理页：相同情境与完整列表]
  B -->|输入搜索词，与情境取交集| C[符合条件的条目]
  C -->|滚动找到并点击查看整句| D[完整原句与对应图卡]
  D -->|返回，保留情境、搜索和滚动位置| C
  C -->|页面返回| A
```

| 关系 | 实际自动断言 | 证据层次 |
| --- | --- | --- |
| 快捷列表→全部 | 快捷显示6条，全部精确显示8条；第7、8条原句相同 | 模拟器页面 |
| 情境→管理页 | 在快捷页点“外出”或“日常交流”，点击查看全部后选中状态及4条ID准确 | 模拟器页面，包含真实路由 |
| 情境+搜索→结果 | 外出/外套定位第7条，日常交流/午饭定位长句；日常交流搜喝水为零条，清空恢复该情境4条 | 模拟器页面 |
| 查看→返回 | 完整句子、图卡数量、滚动可达的查看/返回按钮；返回保留搜索、情境及列表滚动位置 | 模拟器页面 |
| 重复查看→关闭 | 长句和纯文字交替；纯文字无图卡；每次只有1个浮层，关闭后0个 | 顺序自动化，不等于定时连点压力测试 |
| 查看→数据 | 前后收藏、计次及表达/草稿文件原始字符串和相关本地存储完全相同，报告仅保存哈希 | 模拟器存储，不改写或恢复 |
| 查看→顶部输出 | 回到原快捷页后顶部输出文本相同，报告标明起始输出是否为空 | 模拟器页面；不声称其他页面期间的隐藏DOM已观测 |
| 查看→播报 | 实际源码回调测试确保查看不调用播报或计次 | 独立7项回调测试；不是模拟器音频拦截 |

## 使用已有合成工程运行

前提：相邻CBoard目录、既有依赖及官方微信开发者工具已准备好。使用**隔离验收工程**，先将本次构建的dist复制进去；工程已存入 `scripts/fixtures/phrase-flow.json` 中的8条合成常用语，保留对应几何图片。这个JSON是既有readability合成资料的期望快照，**不是产品的导入格式**。本脚本不初始化新档案、不覆盖资料；空工程、缺少资料、条目不符都会失败，不能算通过。

PowerShell（在小程序仓库运行；两个路径换成自己的实际位置）：

```powershell
$env:WECHATIDE_SKILL_CLI = 'C:\实际安装位置\微信开发者工具\wechatide.cmd'
$env:WEAPP_E2E_EXPECT_WIDTH = '375'
npm run test:e2e:phrase-flow -- 'D:\隔离测试工程' 'D:\验收记录\phrase-flow-375' --isolated-fixture
```

- 确认模拟器已编译完成、页面正常，再运行；脚本不会开关其他项目、刷新、切设备或修改字号。
- 每次使用新的证据目录，保留失败结果。支持375/768等实际宽度；传入预期宽度后不符即失败，不把414当375。
- Windows从已配置CLI的同目录调用官方Electron入口，避免中文路径和函数源码被命令行转义。未调用本机私人脚本、无新增依赖；临时参数文件仅写系统临时目录并在结束时删除。
- 输出 `result.json`、第7/8条浮层截图、返回列表截图。失败记录所在阶段、实际页面和截图；诊断失败也保留错误。
- 存储快照只做比较，失败不会“恢复”覆盖现场；日志不保存原始存储正文。
- 返回旧页面后重新取得currentPage，避免旧页面等待造成“not on top of page stack”误判。

相关源码验证：

```powershell
node node_modules/vitest/vitest.mjs run src/features/communication/savedPhraseNavigation.test.ts src/features/communication/management.test.ts tests/phrase-preparation-components.test.ts
node --test scripts/saved-phrase-use-callbacks.test.cjs
npm run typecheck
npm run check:boundary
npm run build:weapp
```

## 本轮实跑记录

日期：2026-10-27（北京时间）。小程序基线7bb101d；CBoard c770abbc8c6887d0aa45351ee77cb700768e9c28；Node 22.14.0、Yarn 1.22.22，官方工具skill 0.3.11，登录/版本检查通过。

- 隔离工程未更新构建时，脚本真实失败于外出情境进入管理页后的选中状态；路由仍含编码后的lifeContext。保留[旧产物失败截图](phrase-readability-evidence/context-flow-before.jpg)，前后数据哈希相同。未把旧产物精确归属于未核对的某个源码SHA。
- 上游产物构建通过，998个产物文件复制到隔离工程并逐文件核对哈希；保留几何图片和既有8条合成资料，不重新注入。
- 工具fullMode重开后第一次systemInfo调用失败，随后独立读回正常patient页再运行；该失败保留为工具启动记录，不称产品白屏已修复。
- 375×603、默认字号的最终脚本通过：两情境完整跨页、5次查看/返回（含纯文字及长句交替）、精确搜索/清空、空搜索提示、按钮可达、返回后列表滚动位置保留。见[长句与返回截图](phrase-readability-evidence/context-flow-375-normal-long.jpg)。
- 375×603、最大字号/高对比度同样通过两情境、5次查看/返回以及全部状态/存储断言。见[最大字号长句与返回](phrase-readability-evidence/context-flow-375-max-long.jpg)。两次最终运行共10次查看/返回，均无旧浮层；完成后原字号与对比度存储值已逐字恢复。
- 本轮37项Vitest、7项实际源码回调测试、typecheck、check:boundary、脚本ESLint及构建/产物检查通过。构建保留既有主包1.5MiB建议值及插件体积未验证提示；未上传预览或做正式性能扫描。

本机原始证据在项目父目录logs：context-flow-before-sync、context-flow-375-normal（工具启动失败）、context-flow-375-normal-ready（首次完整通过）、context-flow-375-normal-final、context-flow-375-max-final、context-flow-preferences-restored.json及对应build/unit/callbacks/typecheck/boundary/script-lint记录。新脚本的官方API调用顺序验证和源码回调测试分别记录，互不冒充。

边界：此次尚无768px新整链路结果，也未测试真机、非空顶部输出、定时连点压力或模拟器音频拦截。既有768px布局结果是历史证据，不计入本轮。用户要求优先测试，本轮未发现需要新增UI修复的问题，不改分词、配图、身份、存储或播报逻辑。

方法复用记录：焦点问题帮助限定为一条链；每条状态关系对应一个实跑断言，并把源码测试、模拟器观察与未验证项分开。方法材料无需安装成运行工具，也不构成自动外发或配置修改授权。


本机实跑命令（路径只说明此次证据来源；他人运行使用上面的可替换路径）：

```powershell
. ..\.tools\Use-ProjectEnvironment.ps1
$env:WEAPP_E2E_EXPECT_WIDTH = '375'
node scripts/weapp-phrase-flow.mjs 'D:\文档\ChatGPT\图语家\.tools\readability-simulator' 'D:\文档\ChatGPT\图语家\logs\context-flow-375-normal-final' --isolated-fixture
# 在同一隔离工程切到最大字号/高对比度后：
node scripts/weapp-phrase-flow.mjs 'D:\文档\ChatGPT\图语家\.tools\readability-simulator' 'D:\文档\ChatGPT\图语家\logs\context-flow-375-max-final' --isolated-fixture
node node_modules/eslint/bin/eslint.js scripts/weapp-phrase-flow.mjs --no-ignore
```

本机矩阵调度另由项目父目录.tools/context-flow-matrix.cjs顺序调用以上入口，负责临时切换字号和finally恢复原设置；不把该私人路径作为源码仓入口的运行依赖。自动回归本身不修改字号，结果中的pageClass记录实际读到的字号/对比度。开发构建沿用本机关闭云、AI、联网配图等能力的环境参数。

# 私有归档互操作测试

Updated: 2026-09-20 12:28:40 (Asia/Shanghai) | Codex (GPT-6 Astra)

普通 Vitest 运行只执行离线互操作与配置检查。`privateArchiveCloudInterop.test.ts` 的四项联网用例默认跳过；跳过不表示服务端互操作已经通过。

联网用例会在测试开始与结束时删除目标账号的图库和设备数据归档。只能使用已经准备好的隔离测试服务及专用合成账号，不能使用真实家庭账号。HTTP loopback 地址也可能是生产服务的转发入口；地址检查不能代替数据隔离核实。

显式启用需要同时设置以下进程环境变量，凭据不要写进仓库或日志：

| 变量 | 要求 |
| --- | --- |
| `PRIVATE_ARCHIVE_CLOUD_E2E` | `1` 才启用联网测试；默认关闭 |
| `PRIVATE_ARCHIVE_CLOUD_API_URL` | 明确的 HTTP(S) loopback 地址，不含 URL 登录凭据、查询参数或片段 |
| `PRIVATE_ARCHIVE_CLOUD_E2E_SYNTHETIC_EMAIL` | 专用合成账号邮箱，必须已存在于隔离服务 |
| `PRIVATE_ARCHIVE_CLOUD_E2E_SYNTHETIC_PASSWORD` | 该合成账号密码，不再使用默认密码 |
| `PRIVATE_ARCHIVE_CLOUD_E2E_CONFIRM` | 核实隔离与删除范围后设置为 `I_CONFIRM_ISOLATED_DESTRUCTIVE_FIXTURE` |

旧的 `LOCAL_RUNTIME_USER_EMAIL` 与 `LOCAL_RUNTIME_USER_PASSWORD` 不再作为这组测试的隐式账号来源。配置不完整时，在登录和删除归档之前失败。

Windows 上通过工作区 `scripts/windows-test-runtime.ps1` 的 Vitest adapter 运行，指定测试文件；不要绕过受管临时目录和进程控制。仅验证配置时运行 `privateArchiveCloudE2EConfig.test.ts`，并保持联网开关关闭。

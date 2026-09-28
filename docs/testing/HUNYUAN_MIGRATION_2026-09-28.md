# 腾讯混元迁移：真实接入与发布验收

2026-09-28。**腾讯混元 Hy3 已真实接通并发布至两个正式域名。** 用户明确授权模型按量计费、两次短测试及通过后部署；两次调用及发布验收均通过。本记录不代表备案已通过，未提交公安备案申请。

## 云端配置

- 用户完成 TokenHub 服务授权，并明确批准创建专用密钥及保存到服务器。
- `eliangmat-production` 仅允许 `hy3`，IP 白名单为现有网站服务器，每日上限 100,000 计费 Token（免费包不计入）。控制台确认创建成功。
- 密钥经一次性本机页面及 SSH 写入服务器 `.config/platform.env`，权限 600；未进入聊天、仓库或日志。本机临时页面及服务已关闭，剪贴板不再保留密钥。
- 修改前配置保存在 `/home/deploy/eliangmat-backups/hunyuan-config-2026-09-28T07-47-02-664Z-880013/platform.env.before`，权限 600；只新增/合并四项 `HUNYUAN_*`，其他配置保持原样。此备份仅供受权运维恢复，不能公开其内容。
- 迁移代码 `4a84a80625c4bf72378f201373047c7f9da09f96` 已推送 GitHub main，服务器已 fast-forward 同步；镜像 `eliangmat-platform:4a84a80625c4` 构建成功。
- 用户随后确认继续，控制台仅启用 Hy3 按 Token 计费，显示“运行中 / 已启用”；其他模型未一键开启。控制台同时显示 Hy3 免费额度已领取，费用以腾讯云实际账单为准；未购买套餐。

## 真实调用与发布结果

- 服务器使用新平台的实际网关执行两次独立虚构短测试，每次最多 1,024 输出 Token，没有读取客户对话、资料或手机号。普通 JSON 与 SSE 均返回真实 `actualModel: hy3`、`finishReason: stop` 和预期短文本；SSE 收到 4 个文本片段。
- 普通调用：输入 36、输出 7、总计 43 Token，请求 ID `c08681a8-f045-4032-ac5e-2170c9bf8f1f`。
- 流式调用：输入 36、输出 7、总计 43 Token，请求 ID `fb95b584-9628-4ff1-bc07-1edd7f503798`。合计 86 Token，2026-09-28 07:52 UTC 完成；未追加更多真实调用。
- GitHub main 同步成功。服务器部署 revision `c1c741f9804fb9e96124e9fae24ae874c787d62a`，实际镜像 `eliangmat-platform:c1c741f9804f`；与真实调用所测镜像内容 SHA-256 均为 `e97c58730e3322db7cc96aef9007d26ff2eeb990fc830be239f7463b418fa57f`。
- 使用部署技能的 Git 同步、备份与验证原则，按当前架构执行 `scripts/platform/activate-eliangai.sh` 做增量发布，退出码 0；不是 bootstrap，没有运行旧 `deploy_to_tencent.sh`。仅重建 platform 并 reload Nginx，其余三容器保持运行。
- 一致性快照在短暂停写时生成，备份 `/home/deploy/eliangmat-backups/eliangai-activation-20260928T075306Z-c1c741f9`。原镜像 `eliangmat-platform:d98284f7afbd` 保留；脚本确认服务器原环境文件、当前平台配置、会话密钥及 SSL 文件前后 SHA-256 不变。
- 两域共 20 项公网 HTTPS 验收通过：首页、登录页、JS 资产、健康、匿名会话、未登录接口拒绝、非法 Origin 拒绝、开发登录不存在。生产会话仍为腾讯短信模式，非开发登录。
- 运行中的容器只导出混元网关：`id: hunyuan`、`gateway: tokenhub.tencentmaas.com`、`connected: true`，未导出 Gemini 工厂。旧内部 runtime-demo 健康接口 200，modeling skills 接口 200 / 6 项，仅作遗留容器未受损检查，不代表新平台公开这些旧端点。
- 对快照和当前持久化存储只读比对：2 个 `state.json` 均逐字节一致，无文件缺失。该生产存储中 Gemini 历史记录数量为 0，不能将它表述为已验证真实旧 Gemini 对话；历史来源保留逻辑由自动化回归覆盖。
- 浏览器已确认新域首页正常加载并显示对应 ICP 号。未发送新短信，也未代用户确认账号/项目的资料外发，所以不把这轮验收称为真实用户登录后完整操作测试。

若需回退，先停止新外部调用并明确说明供应商状态；不能把恢复旧镜像称为混元仍在运行，也不能暗中恢复 Gemini 外呼。更新前的独立配置备份与发布时的数据快照分别保留。

## 实际迁移范围

- 正式平台入口 `server/platform.cjs`、预览及知识开发入口只创建腾讯混元网关，不再读取 Gemini 配置或自动回退到旧模型。遗留独立应用不在本次迁移范围，不能据此声称仓库所有旧功能已改接混元。
- 仅允许国内官方 `https://tokenhub.tencentmaas.com/v1`，禁止重定向与任意代理地址。默认型号 `hy3`；显式支持 `hy3-preview`、`hy4-preview`，实际可用性须在腾讯云账号中确认。
- 使用专用 `HUNYUAN_API_KEY`，不是短信 CAM SecretId/SecretKey，也不复用旧 Gemini 密钥。密钥为空时仅开放本地检索，不显示已接通外部推理。
- 普通及 SSE 回复必须携带可核验的混元型号，保存实际型号、请求标识及返回的 Token 用量。未返回的用量不补零，错误或半途断流不算成功；原始思维链不进入前端。
- 账号对话、项目对话及账号默认项分别确认外发范围。供应商、官方接口或型号变化会使旧授权失效；旧弹窗的确认也不能授权新配置。调用前与流式过程中继续验证资料权限。
- 已有 Gemini 对话、历史用量和原授权按原始来源保留，不改名成混元。旧模型选择在读取时回到本地检索，不批量改写历史存储。
- 隐私政策和服务条款按“选用腾讯混元时”的实际处理方式说明，没有声称本平台已获得 AI 相关资质。

## 配置与首次使用

1. 登录后选择“腾讯混元 Hy3”，确认当次显示的数据处理范围。账号、项目、未来项目默认项分别管理；旧 Gemini 授权不会自动替用户授权混元。
2. 专用 Key 只在服务器受保护配置中保存。不要把密钥放入聊天、Git、前端环境变量或截图；新建更多密钥或提高用量限额需另行授权。
3. 四个模型配置项见 `scripts/platform/platform.env.example`：`HUNYUAN_BASE_URL`、`HUNYUAN_API_KEY`、`HUNYUAN_TEXT_MODEL`、`HUNYUAN_MAX_OUTPUT_TOKENS`。本次正式服务已配置，预览仍只读取 `.dev` 白名单文件，不继承生产密钥。
4. `eliangai.com` 和 `scivisualizer.com` 共用该平台实例。今后更换型号、网关或供应商时，需要重新核对实际调用和相应数据授权；失败时不暗中回退 Gemini。

模型迁移不等于备案材料齐全或审核通过。应以实际上线功能、实际接入型号及腾讯提供的有效材料向审核方说明，其他登记及实名要求仍需单独核实。

## 本地验收

- `npm run test:platform`：113/113 通过，包含网关、两条推理入口、授权指纹、历史来源、配置白名单、登录、租户隔离及科研记录回归。
- `scripts/platform/audit-http.cjs`：95/95 HTTP 检查通过，临时数据目录、短信 stub、无真实短信或模型调用；输出隔离于临时目录，没有覆盖既有验收记录。
- `npm run build`：TypeScript 与 Vite 构建通过；保留既有 3D 包体积超过 500 kB 的提示。
- 修改过的 JS/TS 文件 ESLint 与 `git diff --check` 通过。
- 上述自动化与 HTTP 审计使用 mock；另有本节之前记录的两次真实网关测试。未生成新备案材料或提交申请。

## 官方协议参考

- [TokenHub 快速开始](https://cloud.tencent.cn/document/product/1823/130058)
- [混元模型调用指南](https://cloud.tencent.com/document/product/1823/132252)
- [语言模型调用概览](https://cloud.tencent.com/document/product/1823/130079)
- [Chat Completions 字段说明](https://cloud.tencent.com/document/product/1823/135872)

以上是接入协议依据，不是本网站的备案或登记证明。

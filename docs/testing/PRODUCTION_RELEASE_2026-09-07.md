# EliangMat AI 生产发布记录

2026-09-07，用户明确授权部署。正式地址：[EliangMat AI](https://scivisualizer.com/)，`www.scivisualizer.com` 同样提供 HTTPS。沿用既有域名；产品名称为 EliangMat AI。

## 发布结果

- GitHub `main` 同步成功：产品版本 `518ed5d`，生产切换版本 `9c9e77bb8f7699bd2d3b9ed879436d5ea9cdba57`。此发布记录属于部署后的文档更新，运行镜像仍固定为 `eliangmat-platform:9c9e77bb8f76`。
- 对已有 Git 检出执行 fast-forward pull 后，用 `scripts/platform/deploy-server.sh` 完成首次平台切换，没有 bootstrap。部署技能中的旧服务器地址不适用，使用 `RULES.md` 与实际连通性核实的生产服务器 `deploy@118.25.15.120`。
- **未执行旧 `deploy_to_tencent.sh`**：该脚本面向旧后端。本次新平台在独立容器和持久目录运行，HTTPS 入口通过 compose override 转发至平台，旧 backend、MongoDB 留存供数据保全和回退。
- 脚本退出码 0；Nginx 语法通过，容器均运行，旧 backend 与 MongoDB 保持 healthy。平台仅绑定主机回环 `4320`，通过现有 `80/443` 入口访问。
- 充值、团队邀请、真实仿真、设备自动接入与公司模型迭代统一“待开放”；人工任务、文件回传、CSV 分析、账号/项目记忆、资料与模型对话保持本次正式版本的实现范围。

## 数据与配置

服务器私有备份目录：

```text
/home/deploy/eliangmat-backups/20260907T025945Z-9c9e77bb
```

备份包括服务器配置/TLS/账号/上传文件归档、MongoDB gzip archive、运行文件归档及原前端容器和 Nginx 配置；归档可读取、压缩完整性检查通过。没有进行恢复演练。原 `server/.env` 和 TLS 证书/私钥 SHA-256 核对一致，原有 `.env.local`（存在时）保留并纳入归档；未用仓库默认值覆盖服务器配置。

所需 Gemini 和腾讯短信配置由旧运行服务白名单导入服务器私有 `.config/platform.env`，权限 0600；密钥、原始数据库、本机 QA 与预览目录均未入 Git 或 Docker 构建上下文。新平台持久目录为 `.data/platform`。

**旧系统数据已保存，未迁入新版。** 发布前旧 JSON 中有 1 个手机号账号；MongoDB 保留原会话、任务与研究文件记录。旧记录归属与新版结构尚无经验证的映射，未尝试将匿名历史或旧会话凭证导入新账号。新版通过手机号短信验证建立/恢复自己的账号与空间，本机 QA 数据不进入生产。

## 验证与边界

- 发布前：90 项平台回归、14 项登录测试通过；此前 95 项隔离 HTTP 检查与本机 Computer Use 全流程复测通过，参见 [修复报告](FORMAL_PLATFORM_FIXES_2026-09-07.md)。
- 发布后：22 项外网 HTTP/静态资产检查通过，包括首页、登录、指南、Cookie 政策、研发与账号路由的正式 SPA 入口及 JS/CSS；`/api/health` 返回 `eliangmat-platform`，匿名会话返回 `delivery: tencent` / `development: false`。
- 未登录的研发/资料 API 为 401；开发登录与样例地址为 404；无效号码为 400；外部 Origin 为 403；HTTP 正确跳转 HTTPS；根域和 www TLS 健康检查成功。
- 生产容器使用实际 Gemini 网关做一次不含客户数据的短提示流式调用，返回“部署验证通过。”，模型 `gemini-3-flash`，结束原因 `stop`，输入 16 / 输出 156 / 总计 172 Token。此项证明生产模型连接与流解析可用，不等于登录用户经 HTTPS 的完整对话验收。
- 保留的旧后端内部 `/api/runtime-demo/health` 为 200 且 `runtimeDemo: true`；`/api/runtime-demo/skills?domain=modeling` 为 200，6 项；这些旧演练端点不作为新平台公开能力。
- 线上 Computer Use 曾打开官网并读到加载状态，后续工具连续超时，未完成线上实际交互复核。真实短信没有发送，正式新登录与短信送达未实测，不能用配置齐全替代送达验收。

## 回退与后续运行

首次切换回退脚本在上述私有备份目录的 `rollback.sh`。仅在决定恢复旧站时执行；它用未变更的旧前端镜像重建入口，保留新平台目录、旧后端与 MongoDB，不删除研究数据。本次切换通过检查，没有触发回退。

当前入口 override 为 `scripts/platform/ingress.compose.yml`，挂载 `.config/platform-nginx.conf`。镜像版本记录在 `.config/release.env`，备份路径记录在 `.config/latest-backup`。后续发布应备份当前 `.data/platform` 和入口配置，基于当前平台版本准备回退；不要重复使用首次切换脚本或直接运行旧部署脚本。

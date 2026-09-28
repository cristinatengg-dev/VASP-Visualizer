# eliangai.com 正式激活与公安备案接续

2026-09-28，用户授权开通新域名、悬挂备案号并继续办理公安联网备案。

## 已确认的备案结果

重新登录腾讯云并刷新“我的备案”，界面显示“新增服务 - 备案成功”“管局审核通过”。网站 `eliangai.com` 为“易量芯材材料研发平台”，对应 `浙ICP备2026000780号-3`，状态正常。原域 `scivisualizer.com` 对应 `浙ICP备2026000780号-2`。

早先同日记录的“审核中”来自登录失效的旧页面，已纠正并告知用户；不得据此重复申请或继续关闭网站。

## 发布结果

- 代码 `d98284f7afbd70ae236050b7a35e3379959bfd86` 已推送 GitHub main，并在腾讯云现有 Git 检出中 fast-forward 同步。构建与运行镜像：`eliangmat-platform:d98284f7afbd`。
- 执行 `scripts/platform/activate-eliangai.sh`，退出码 0。这是已有平台增量发布，不是 bootstrap；未运行旧 `deploy_to_tencent.sh` 或首次平台切换脚本。部署技能提供的 GitHub 同步与数据保全原则用于本次发布，实际入口遵从已验证的现行平台架构。
- 解除新域名 503 等待状态，主域提供平台，HTTP 与 www 以 308 跳转 `https://eliangai.com`，保留请求路径与查询参数。旧站仍直接提供平台。
- 静态首页和通用合规组件共享域名映射，新域显示 `-3`，旧域显示 `-2`，均链接 `https://beian.miit.gov.cn/`。尚未取得公安备案号，不预先悬挂。
- 仅更新 platform 容器及 reload Nginx，旧 backend、MongoDB、frontend 容器继续运行。既有证书与自动续期保持可用。

## 保全与回退

私有备份目录：`/home/deploy/eliangmat-backups/eliangai-activation-20260928T043529Z-d98284f7`。

- 原镜像 `eliangmat-platform:3cc813bc3390` 保留；备份保存先前 Nginx 配置、发布变量、容器配置以及包含 `.data/platform`、`.config`、`ssl/`、`server/.env`、存在的 `.env.local` 和 `db.json` 的压缩归档。
- 平台写入在快照期间短暂暂停，归档完成即恢复；归档 gzip 完整性检查通过。平台仍挂载同一 `.data/platform`，没有迁移、初始化或删除用户数据。
- `server/.env`、存在的 `server/.env.local` / `server/db.json`、`.config/platform.env`、会话密钥与 SSL 文件的前后 SHA-256 清单一致。密钥、实际客户资料及公安数据码不进入仓库。
- 激活脚本对失败和 HUP/INT/TERM 配置退出清理与原镜像/入口恢复；本次未触发回退。切换时健康探测出现短暂连接重置/旧 503，后续重试全部成功。

## 验证

- 本地 TypeScript / Vite 构建通过，91 项平台回归通过，相关组件 lint、shell 语法和 diff 检查通过。
- 两域共 23 项公网 HTTP 检查通过：首页、登录页、首页 iframe、备案映射模块、JS/CSS 资产、平台健康、匿名会话、未认证访问拒绝、非法来源拒绝及三个新域跳转。
- 受信任 HTTPS 正常；匿名会话返回 `authenticated: false`、`delivery: tencent`、`development: false`。
- 浏览器在实际新域首页读到 `浙ICP备2026000780号-3`，点击“进入工作区”正常进入手机号登录页；旧域实际首页读到 `浙ICP备2026000780号-2`。新站标签保留给用户查看。
- 旧后端内部 `/api/runtime-demo/health` 返回 200 且 `runtimeDemo: true`；`/api/runtime-demo/skills?domain=modeling` 返回 200 / 6 项。这些旧端点不作为新平台公开能力。
- 本轮没有发送真实短信、登录客户账号或调用模型，所以不把匿名入口检查称为短信送达或完整登录后研究操作验收。新域 Cookie 与旧域分离，用户需用原手机号重新登录。

## 公安联网备案：尚未提交

腾讯云数据码有效期至 **2026-10-20 19:10:18**。码本身保留在腾讯云控制台，未写入本文件。ICP 备案信息已同步，不等于公安备案完成。

已打开全国互联网安全管理服务平台的“用户登录”，跳转至 `ywtb.mps.gov.cn` 官方政务登录页。当前需要用户完成实名账号登录及滑块验证，尚未进入申报表，也未创建、提交或声明公安备案完成。页面提示个人经办人账号也可为企业主体办理业务。

用户登录后：导入腾讯云数据码，核对主体、负责人、实际办公地址与网站资料，补全表单；以实际办公地址确定受理公安机关，不能仅凭历史对话猜测属地。确认申报内容后提交，获批再挂公安备案号与图标。

官方流程：[公安备案数据码使用指引](https://cloud.tencent.com/document/product/243/120137)、[备案号悬挂说明](https://cloud.tencent.com/document/product/243/61412)。

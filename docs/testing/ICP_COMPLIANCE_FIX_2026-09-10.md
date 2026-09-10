# 已备案网站页面整改与发布

2026-09-10，按用户提供的腾讯云提示修复 `scivisualizer.com` 与 `www.scivisualizer.com` 的首页备案号和标题。用户已授权修复及上线。

## 上线内容

- 主页面与首页 iframe 的标题为 `杭州易量芯材科技有限公司｜EliangMat AI`，主页面语言为 `zh-CN`。
- 首页可见页脚增加 `浙ICP备2026000780号`，链接到 `https://beian.miit.gov.cn/`，新窗口打开并使用 `noopener noreferrer`。
- 通用合规组件同步使用准确中文备案号。
- 代码提交 `3cc813bc3390684c621225d9e925a2f5e1689cd8` 已推送 GitHub main；运行镜像为 `eliangmat-platform:3cc813bc3390`。

## 发布方式与保全

对腾讯云现有 Git 检出进行 fast-forward pull，然后构建并仅重建 platform 服务。本次为现有平台增量发布，没有 bootstrap。未执行 `deploy_to_tencent.sh` 或旧版部署脚本，也未重复执行首次切换脚本；旧脚本针对不同运行架构。现有 Nginx 入口、旧后端和 MongoDB 容器保持运行。

私有备份目录为 `/home/deploy/eliangmat-backups/update-20260910T095557Z-3cc813bc`。配置和平台数据的压缩归档完整性检查通过，保留旧镜像 `eliangmat-platform:9c9e77bb8f76`。发布过程中配置了失败时恢复旧平台镜像的处理，验证通过，未触发回退。

`.config/platform.env`、`.config/platform-nginx.conf`、`server/.env`、存在的 `server/.env.local` 和旧域名证书/私钥的 SHA-256 校验保持一致；`server/db.json` 当时不存在。平台持续挂载原 `.data/platform`，未迁移或删除数据。发布版本记录已更新到服务器 `.config/release.env`。

## 验证

- 本地完整平台测试 91/91 通过；TypeScript 与 Vite 生产构建通过。
- 本地浏览器实际读取到主页面和 iframe 的公司标题，并滚动至底部确认备案链接完整可见。
- 服务器通过有效 TLS 对两个域名分别检查首页、首页 iframe、健康接口；标题、备案文本和链接匹配。
- 本机公网 HTTPS 再次检查两个域名的上述 6 个地址，均为 200，返回内容符合预期，健康接口为 `eliangmat-platform`。
- 保留的旧后端内部 `/api/runtime-demo/health` 为 200，`runtimeDemo: true`；`/api/runtime-demo/skills?domain=modeling` 为 200 并返回 JSON。这些端点不是新平台公开能力。
- 平台重建时首次健康探测出现短暂 502，后续探测及外网检查成功；全部容器处于 Up，旧 backend 和 MongoDB 为 healthy。
- 线上浏览器导航两次超时，未完成线上截图复核；实际页面内容由公网 HTTP 检查确认，本地同版页面已完成视觉核验。

本次只完成网站页面整改。未声称腾讯云控制台告警已经消失，仍需其复检确认；未修改新域名 `eliangai.com` 的备案、解析或证书。

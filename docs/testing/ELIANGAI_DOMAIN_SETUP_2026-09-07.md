# eliangai.com 域名接入准备

用户要求将现有 EliangMat AI 接到新购域名 `eliangai.com`。本记录描述准备状态，**不代表新域名已上线**。

## 已确认

- 2026-09-07 权威 DNS：`dns9.hichina.com` / `dns10.hichina.com`，主域 A 查询无答案，www 为 NXDOMAIN；尚未指向现有生产服务器。
- 现有平台运行于腾讯云上海 `118.25.15.120`，版本 `eliangmat-platform:9c9e77bb8f76`，旧站继续运行。
- Chrome 已打开阿里云 DNS 控制台登录页；尚无可用登录会话，等待用户登录并说明新域名备案/腾讯云接入状态。
- 现有证书只覆盖旧域名，不能用于新域名。不能先把新域名指向旧证书并声称 HTTPS 可用。

## 解析目标

| 主机记录 | 类型 | 值 | TTL |
| --- | --- | --- | --- |
| @ | A | 118.25.15.120 | 默认 600 秒 |
| www | A | 118.25.15.120 | 默认 600 秒 |

不新增泛解析、邮箱记录或无可用服务的 IPv6 记录。若控制台出现既有记录，应核对后再处理冲突。

## 服务器接入顺序

1. 保留正在运行的平台镜像与 `.data/platform`。备份现有平台数据、`.config/platform.env`、`.config/platform-nginx.conf` 和 TLS 文件，回退应恢复当前平台入口，不能使用首次发布时恢复旧应用的回退脚本。
2. `node scripts/platform/render-domain-ingress.cjs prepare` 生成候选 Nginx 配置，保留旧站，新增新域名 HTTP ACME 挑战目录。用现有 Nginx 镜像在隔离容器校验候选配置后安装；此阶段新域名普通 HTTP 请求为 503，不提供登录。
3. 使用正规 CA 签发同时覆盖 `eliangai.com` 与 `www.eliangai.com` 的证书。HTTP-01 需要两条 DNS 记录生效，公网 80 端口及 `/.well-known/acme-challenge/` 可访问；如采用 DNS 验证，另行完成 DNS 控制权校验与自动续期配置。
4. 将证书放到服务器 `ssl/eliangai.com/fullchain.pem` 与 `ssl/eliangai.com/privkey.pem`，保护私钥权限；配置自动续期及成功后的 Nginx reload，并验收续期。不可把密钥提交 Git。
5. 向正式环境的 `ELIANGMAT_ORIGINS` 追加 `https://eliangai.com` 和 `https://www.eliangai.com`，保留原来源与其他参数，仅重建同版本平台容器，使来源配置生效。数据目录与 `auth/session.key` 必须保持原样。
6. `node scripts/platform/render-domain-ingress.cjs activate` 生成正式配置，校验后切换入口。`https://eliangai.com` 提供平台，www 和 HTTP 跳转主域；旧站继续兼容访问。此操作不复制数据库、不新建一套客户空间。
7. 验证主域和 www 的公网 DNS、受信任 TLS、重定向、静态资源、匿名会话、来源保护、登录和模型流式代理。新域名 Cookie 与旧域名分离，用户需重新登录；用相同手机号进入现有账号、项目与记忆。

目前仅完成配置准备；未修改 DNS、申请证书或切换生产入口。下次继续前以实际 DNS、浏览器登录状态和服务器配置为准，避免重复操作。

参考：[阿里云网站解析说明](https://help.aliyun.com/zh/dns/pubz-add-website-parsing)、[Certbot Docker 方式](https://eff-certbot.readthedocs.io/en/stable/install.html)、[Certbot Webroot 与续期](https://eff-certbot.readthedocs.io/en/stable/using.html)。现有服务器在中国内地，新域名须确认备案及服务商接入状态；尚未得知用户办理情况。

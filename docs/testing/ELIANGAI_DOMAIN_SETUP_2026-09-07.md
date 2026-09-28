# eliangai.com 域名接入准备

用户要求将现有 EliangMat AI 接到新购域名 `eliangai.com`。本记录按时间记录接入状态，以最新更新为准。

## 2026-09-28 更新：重新认证后确认 ICP 备案成功

- 新域名现已正式上线：主域 HTTPS 返回 200，www 与 HTTP 308 跳转主域。发布镜像 `eliangmat-platform:d98284f7afbd`，完整备份、校验与后续公安备案状态见 [正式激活记录](ELIANGAI_ACTIVATION_2026-09-28.md)。下方安全等待入口是激活前的历史状态。
- 重新登录腾讯云并刷新“我的备案”，当前实际结果为“新增服务 - 备案成功 / 管局审核通过”。`eliangai.com` 网站备案号为 `浙ICP备2026000780号-3`，状态正常；旧域 `scivisualizer.com` 为 `浙ICP备2026000780号-2`。
- 同日早先的“腾讯云审核中”记录来自登录失效的旧页面，不是当天最新结果，已纠正并告知用户。今后查询需要重新认证或刷新确认，不能沿用失效页面的缓存。
- 用户已授权激活网站及继续公安联网备案。使用域名映射为首页和通用合规组件悬挂正确网站备案号；公安备案号尚未获得，不预先添加。
- 公安备案同步数据码有效期至 2026-10-20 19:10:18；码本身仅留在控制台，不记录到 Git。公安部政务服务登录页已打开，当前需用户完成实名登录和滑块验证。未提交公安备案申请。

## 2026-09-28 更新：DNS 与受信任 HTTPS 已就绪，等待备案通过

- `eliangai.com` 与 `www.eliangai.com` 的 A 记录已在公网生效，均指向腾讯云服务器 `118.25.15.120`。权威 DNS 仍为 `dns9.hichina.com` / `dns10.hichina.com`；解析已经由域名管理员完成，后续部署无需再次登录阿里云。
- 已通过 HTTP-01 签发覆盖主域和 www 的 Let’s Encrypt 证书，有效期至 2026-12-27。证书部署在服务器 `ssl/eliangai.com/`；`fullchain.pem` 为 644，`privkey.pem` 为 600，未提交 Git。
- 新增 `scripts/platform/renew-eliangai-certificate.sh`，使用固定摘要的 Certbot 镜像执行 webroot 续期、安全复制证书并校验/重载 Nginx。服务器已安装 deploy 用户定时任务；完整 dry-run、Nginx 语法检查与 reload 已通过。
- 当前入口使用 `secure-prepare` 模式。新域名 HTTP/HTTPS 普通请求均返回 503，并提供受信任 TLS 与 `Retry-After`；ACME 挑战路径正常。旧域名 `https://scivisualizer.com` 继续返回 200，未中断现有用户访问。
- 正式环境来源白名单已追加 `https://eliangai.com` 和 `https://www.eliangai.com`。生产数据、账号、会话密钥、TLS 目录与容器保持原位，没有复制或初始化第二套平台。
- 当时从登录失效的旧页面读到“审核中”，因此没有运行 `activate`；本节是激活前的历史准备记录，最新 ICP 成功结果见上方更新。
- 本次是现有生产 Git 检出的常规、版本感知域名预配置，不是 bootstrap，也未执行旧 `deploy_to_tencent.sh`。备案通过后再生成并校验 `activate` 配置，切换入口并复验登录、旧账号数据、Cookie、来源保护与模型流式代理。

## 已确认

- 2026-09-07 权威 DNS：`dns9.hichina.com` / `dns10.hichina.com`，主域 A 查询无答案，www 为 NXDOMAIN；尚未指向现有生产服务器。
- 现有平台运行于腾讯云上海 `118.25.15.120`，版本 `eliangmat-platform:9c9e77bb8f76`，旧站继续运行。
- 阿里云 DNS 控制台之前停在登录页，尚未代配置解析；腾讯云已登录并提交新域名备案，当前审核中。
- 现有证书只覆盖旧域名，不能用于新域名。不能先把新域名指向旧证书并声称 HTTPS 可用。
- 准备代码已推送 GitHub，服务器现有 Git 检出已同步；ACME 准备配置在生产同款 Nginx 镜像的隔离容器中通过 `nginx -t`。正式激活配置仍须拿到新域名证书后验证。没有重启生产容器、没有执行旧部署脚本，旧站 `/api/health` 仍为 200。

## 备案办理进展（2026-09-07）

- 用户已登录腾讯云，并授权为新域名办理备案。控制台确认公司主体及旧域名 `scivisualizer.com` 备案状态正常；腾讯云域名校验显示 `eliangai.com` 尚无备案号，应办理浙江省“新增服务”。
- 已创建本次新增服务申请，沿用既有公司主体、营业执照及负责人材料完成主体步骤。网站名称填写“易量芯材材料研发平台”，备注如实描述 EliangMat AI 的资料整理、研发项目管理、研究辅助问答和实验数据记录/分析业务；使用原轻量服务器。
- 用户完成负责人核验后，网站服务状态为“正常”。已推进补充材料步骤（无新增必填材料）并核对最终预览中的主体、网站名、域名、业务说明与服务器。
- 提交前读取实时页面，必选声明与可选公安联网备案信息同步均已由用户勾选；代理未操作这两个复选框，沿用用户选择提交。页面实际返回“提交成功”“提交初审 已提交”“腾讯云审核 审核中”。**备案申请已提交，尚未取得新域名备案号，不能视为审核通过。**
- 当前页面提示 1–2 个工作日内电话审核，后续还有工信部短信核验（24 小时内）及管局审核。公安联网备案仅显示同步授权完成，待管局通过后获取数据码，仍需单独完成公安联网备案。
- 私有订单与续办状态保存在本机 Git 忽略的 `.config/eliangai-filing-progress.json`，不把证件号码、照片、手机号、验证码或私有订单地址写入仓库。继续时查看现有审核订单，勿重复新建或撤单；未创建自动监控任务。

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

DNS、证书、自动续期、来源白名单与正式入口均已完成，ICP 成功结果也已重新认证确认；`scripts/platform/activate-eliangai.sh` 已完成有备份与回退的当前平台更新及入口切换。勿重复新建 ICP 申请。当前剩余事项是公安联网备案，需要用户完成实名登录后继续。

参考：[阿里云网站解析说明](https://help.aliyun.com/zh/dns/pubz-add-website-parsing)、[Certbot Docker 方式](https://eff-certbot.readthedocs.io/en/stable/install.html)、[Certbot Webroot 与续期](https://eff-certbot.readthedocs.io/en/stable/using.html)。新域名现已提交腾讯云新增服务备案，正式上线前仍须核对审核结果。

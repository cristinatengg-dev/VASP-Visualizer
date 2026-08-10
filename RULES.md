# VASP-Visualizer 项目标准规则书

> **⚠️ 重要提示：每次开始新任务时，请先阅读本文件。**

---

## 项目基本信息

| 项目名 | SCI Visualizer / VASP-Visualizer |
|--------|----------------------------------|
| 域名 | https://scivisualizer.com |
| 服务器 | 腾讯云轻量应用服务器（上海） |
| 服务器 IP | 118.25.15.120 |
| 服务器用户 | deploy（部署）/ ubuntu（系统默认用户） |
| 登录方式 | SSH 公钥登录，默认密钥 `~/.ssh/id_ed25519` |
| 服务器项目路径 | /home/deploy/VASP-Visualizer |
| 云服务商 | 腾讯云（Tencent Cloud） |

---

## 技术架构

```
┌─────────────────────────────────────────────────┐
│                 DNSPod / HTTPS                  │
│          (scivisualizer.com → 118.25.15.120)    │
└─────────────────────┬───────────────────────────┘
                      │ HTTPS :443 / HTTP :80
┌─────────────────────▼───────────────────────────┐
│         Docker: vasp-visualizer-frontend-1      │
│              Nginx (nginx:alpine)               │
│  • 静态文件: /usr/share/nginx/html (dist/)      │
│  • /api/* → 反向代理 → backend:3000             │
│  • 端口: 80, 443 (SSL证书: ssl/)                │
└─────────────────────┬───────────────────────────┘
                      │ 内部网络
┌─────────────────────▼───────────────────────────┐
│         Docker: vasp-visualizer-backend-1       │
│              Node.js (server/index.js)          │
│  • 端口: 3000（仅内网，不暴露给外部）           │
│  • 数据文件: server/user-data/db.json, server/uploads/ │
└─────────────────────┬───────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────┐
│         Docker: vasp-visualizer-mongo-1         │
│              MongoDB (mongo:latest)             │
│  • 端口: 27017                                  │
│  • 数据持久化: docker volume mongo-data         │
└─────────────────────────────────────────────────┘
```

### 本地开发环境
- **框架**: React + TypeScript + Vite
- **3D渲染**: Three.js / React Three Fiber
- **状态管理**: Zustand
- **样式**: TailwindCSS
- **后端**: Node.js + Express + MongoDB

---

## 环境变量说明

### `.env`（本地开发）
```
VITE_API_URL=http://localhost:3000
TOKEN_SECRET=<随机长密钥>
TENCENTCLOUD_SECRET_ID=<腾讯云 SecretId>
TENCENTCLOUD_SECRET_KEY=<腾讯云 SecretKey>
TENCENT_SMS_SDK_APP_ID=<短信应用 SDK AppId>
TENCENT_SMS_SIGN_NAME=<已审核短信签名>
TENCENT_SMS_TEMPLATE_ID=<已审核验证码模板 ID>
TENCENT_SMS_REGION=ap-guangzhou
ADMIN_PHONES=+8613800000000
```

### `.env.production`（生产构建）
```
VITE_API_URL=/api
TOKEN_SECRET=<随机长密钥>
TENCENTCLOUD_SECRET_ID=<腾讯云 SecretId>
TENCENTCLOUD_SECRET_KEY=<腾讯云 SecretKey>
TENCENT_SMS_SDK_APP_ID=<短信应用 SDK AppId>
TENCENT_SMS_SIGN_NAME=<已审核短信签名>
TENCENT_SMS_TEMPLATE_ID=<已审核验证码模板 ID>
TENCENT_SMS_REGION=ap-guangzhou
ADMIN_PHONES=<逗号分隔的 E.164 手机号>
```

> **注意**: 生产环境 `VITE_API_URL=/api` 使用相对路径，由 Nginx 代理转发到 backend:3000。

### 手机短信登录

- 登录仅支持手机号 + 短信验证码，不保留邮箱验证码接口。
- 中国大陆 11 位手机号会规范化为 E.164（例如 `+8613800000000`）；国际号码必须包含 `+国家/地区码`。
- 腾讯云短信签名和正文模板必须先审核通过，国内短信需有可用套餐包。
- 验证码模板参数顺序必须是 `{1}` 验证码、`{2}` 有效分钟数。
- 验证码有效期 5 分钟、同一手机号 60 秒内不可重复发送，验证码验证成功后立即作废。
- `ADMIN_PHONES` 仅用于给明确配置的手机号自动授予企业权限，不得在代码中硬编码管理员账号。

生产环境需要先在腾讯云短信控制台创建应用、审核签名和验证码模板，然后在服务器 `/home/deploy/VASP-Visualizer/.env` 中写入：

```
TENCENTCLOUD_SECRET_ID=<腾讯云 SecretId>
TENCENTCLOUD_SECRET_KEY=<腾讯云 SecretKey>
TENCENT_SMS_SDK_APP_ID=<短信应用 SDK AppId>
TENCENT_SMS_SIGN_NAME=<已审核短信签名>
TENCENT_SMS_TEMPLATE_ID=<已审核验证码模板 ID>
TENCENT_SMS_REGION=ap-guangzhou
```

部署后用 `/api/auth/send-phone-code` 实测指定手机号能否收到短信；请求体为 `{"phone":"+8613800000000"}`。支持邮箱 `support@scivisualizer.com` 仅用于客户支持，不参与账号登录。

---

## 部署流程（完整记录）

### 首次部署 / 全量部署

#### 方法一：deploy.sh 一键部署（推荐）

当前部署方式使用 `deploy` 用户 + 公钥登录 + 远端 `git pull` + 手动 `docker build` + `docker compose up --no-build` + health check。

**使用方式：**
```bash
cd /Users/a1234/VASP-Visualizer

DEPLOY_HOST=118.25.15.120 \
DEPLOY_PORT=22 \
DEPLOY_USER=deploy \
DEPLOY_KEY=~/.ssh/id_ed25519 \
DEPLOY_DIR=/home/deploy/VASP-Visualizer \
bash deploy.sh
```

**该脚本流程：**
1. 推送或确认 GitHub `main` 已是最新代码
2. 通过 SSH（端口 22，`deploy` 用户，公钥认证）在新服务器执行 `git pull`
3. 在服务器上执行手动 `docker build`
4. 执行 `docker compose up --no-build` 启动容器
5. 运行 health check 验证部署成功（期望 HTTP 200）

**关键变更说明：**
- SSH 端口为 **22**
- 部署用户为 **`deploy`**
- 认证方式为**公钥登录**（密钥：`~/.ssh/id_ed25519`）
- 服务器项目路径为 `/home/deploy/VASP-Visualizer`

> **注意**：已在 `.gitignore` 中加入 `*.tar.gz` / `*.tgz`，并清理了之前遗留的部署压缩包文件，避免误提交。

#### 方法二：腾讯云控制台 WebShell（当 SSH 不可用时）

当本地 SSH 无法连接服务器时，使用此方法：

1. 登录 [腾讯云控制台](https://console.cloud.tencent.com)
2. 进入「轻量应用服务器」→ 找到 IP 为 `118.25.15.120` 的实例
3. 点击「登录」→「VNC 登录」或「WebShell 登录」
4. 在服务器终端执行：

```bash
cd /home/deploy/VASP-Visualizer
git pull origin main
docker build -t vasp-visualizer-backend ./server
docker build -t vasp-visualizer-frontend .
docker compose down
docker compose up -d --no-build --force-recreate --remove-orphans
```

验证状态：
```bash
docker compose ps
curl -sk https://localhost/api/health
curl -sk https://localhost/api/runtime-demo/health
```

### 仅更新后端代码（快速部署）

只修改了 `server/index.js` 时，使用轻量脚本：

```bash
cd /Users/a1234/VASP-Visualizer
expect upload_server_only.expect
```

该脚本只做：
1. `scp` 上传 `server/index.js` 到服务器
2. `docker compose restart backend` 重启后端容器

---

## SSH 连接问题排查

### 已知问题：本地 SSH 可能被服务器拒绝

**症状**：`kex_exchange_identification: Connection closed by remote host`

**原因**：服务器可能限制了 SSH 访问（本地公钥未授权，或 SSH 守护进程配置限制）

**当前本地 SSH 配置** (`~/.ssh/config`)：
```
Host 118.25.15.120
    User deploy
    IdentityFile /Users/a1234/.ssh/id_ed25519
```

**解决方案**：
- 通过腾讯云 WebShell 在服务器确认 `deploy` 用户的 `~/.ssh/authorized_keys` 已包含本机公钥：
  ```bash
  echo "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFliDryLTJYHWvsAitaSQyq93Ua/fybGUrKMpQZY7tVl" >> ~/.ssh/authorized_keys
  chmod 600 ~/.ssh/authorized_keys
  ```
- 然后本地即可直接 SSH 连接

---

## 部署验证

部署完成后，执行以下命令验证：

```bash
# 验证 API 健康状态
curl https://scivisualizer.com/api/health
# 预期返回: {"ok":true}

# 验证 HTTPS 网站
curl -I https://scivisualizer.com
# 预期: HTTP/2 200

# 验证容器状态（需 SSH 到服务器）
docker compose ps
# 预期: 3 个容器全部 Up
```

### 历次部署验证记录

| 日期 | 部署方式 | 结果 | 备注 |
|------|---------|------|------|
| 2026-07-17 | 新服务器 GitHub pull + Docker 重建 | ✅ 成功 | 118.25.15.120 三容器 Up，API 正常 |

---

## 数据持久化

| 数据类型 | 存储位置 | 说明 |
|---------|---------|------|
| 用户数据（JSON） | `server/user-data/db.json` → 容器内 `/app/user-data/db.json` | 目录卷挂载，重建容器不丢失 |
| 上传文件 | `server/uploads/` → 容器内 `/app/uploads` | 卷挂载，重启不丢失 |
| MongoDB 数据 | Docker Volume `mongo-data` | 命名卷，持久化 |

---

## SSL 证书

- **证书路径（本地）**: `ssl/scivisualizer.com.crt` 和 `ssl/scivisualizer.com.key`
- **证书路径（服务器）**: `/home/deploy/VASP-Visualizer/ssl/`
- **Nginx 引用**: `/etc/nginx/ssl/scivisualizer.com.crt`
- **当前入口**: 新服务器 Nginx 直接终止 HTTPS；大陆公网域名访问需要完成腾讯云接入备案。

---

## 项目目录结构

```
VASP-Visualizer/
├── src/                    # 前端源代码 (React + TypeScript)
├── server/                 # 后端源代码 (Node.js + Express)
│   ├── index.js            # 后端主入口
│   ├── user-data/db.json   # 用户数据（持久化）
│   └── uploads/            # 上传文件（持久化）
├── public/                 # 静态资源
├── dist/                   # 构建输出（不上传，Docker 内自动构建）
├── ssl/                    # SSL 证书
├── Dockerfile              # 前端 Docker 镜像构建（多阶段：Node→Nginx）
├── docker-compose.yml      # 三服务编排（frontend + backend + mongo）
├── nginx.conf              # Nginx 配置（HTTP/HTTPS + API 反向代理）
├── deploy.sh               # 本地触发新服务器部署脚本
├── .env                    # 本地开发环境变量
├── .env.production         # 生产环境变量
├── DEPLOY.md               # 部署说明文档
├── RULES.md                # 本文件（标准规则书）
└── USER_MANUAL.md          # 用户手册
```

---

## 常用运维命令

```bash
# 查看所有容器状态
docker compose ps

# 查看 backend 日志（实时）
docker logs -f vasp-visualizer-backend-1

# 查看 frontend(nginx) 日志
docker logs -f vasp-visualizer-frontend-1

# 重启单个服务
docker compose restart backend
docker compose restart frontend

# 停止所有服务
docker compose down

# 完整重新部署（本地执行）
bash deploy.sh

# 进入 backend 容器 shell
docker exec -it vasp-visualizer-backend-1 sh

# 进入 mongo 容器
docker exec -it vasp-visualizer-mongo-1 mongosh
```

---

*本文件由 AI 助手在 2026-03-07 首次部署成功后自动生成，后续每次部署应更新「历次部署验证记录」表格。*

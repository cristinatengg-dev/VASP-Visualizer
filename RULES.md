# VASP-Visualizer 项目标准规则书

> **⚠️ 重要提示：每次开始新任务时，请先阅读本文件。**

---

## 项目基本信息

| 项目名 | SCI Visualizer / VASP-Visualizer |
|--------|----------------------------------|
| 域名 | https://scivisualizer.com |
| 服务器 | 腾讯云香港 |
| 服务器 IP | 43.154.165.254 |
| 服务器用户 | root |
| 服务器密码 | 1Yitengteng_ |
| 服务器项目路径 | /root/VASP-Visualizer |
| 云服务商 | 腾讯云（Tencent Cloud） |

---

## 技术架构

```
┌─────────────────────────────────────────────────┐
│              Cloudflare CDN / DNS               │
│           (scivisualizer.com → 43.154.165.254)  │
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
│  • 数据文件: server/db.json, server/uploads/    │
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
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_USER=2218114919@qq.com
SMTP_PASS=mcjxnwmxvuyueaei
```

### `.env.production`（生产构建）
```
VITE_API_URL=/api
SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_USER=2218114919@qq.com
SMTP_PASS=qztivdbksclieabe
```

> **注意**: 生产环境 `VITE_API_URL=/api` 使用相对路径，由 Nginx 代理转发到 backend:3000。

---

## 部署流程（完整记录）

### 首次部署 / 全量部署

#### 方法一：upload_and_deploy.sh 一键部署（推荐）

新部署方式使用 `deploy` 用户 + 公钥登录 + rsync 同步 + 远端手动 `docker build` + `docker compose up --no-build` + health check。

**使用方式：**
```bash
cd /Users/a1234/VASP-Visualizer

DEPLOY_HOST=43.154.165.254 \
DEPLOY_PORT=2222 \
DEPLOY_USER=deploy \
DEPLOY_KEY=~/.ssh/vasp_deploy \
DEPLOY_DIR=/home/deploy/VASP-Visualizer \
bash upload_and_deploy.sh
```

**该脚本流程：**
1. 通过 rsync（端口 2222，`deploy` 用户，公钥认证）同步代码到服务器
2. 在服务器上执行手动 `docker build`（避免 `compose build requires buildx 0.17` 问题）
3. 执行 `docker compose up --no-build` 启动容器
4. 运行 health check 验证部署成功（期望 HTTP 200）

**关键变更说明：**
- SSH 端口从 22 改为 **2222**
- 登录用户从 `root` 改为 **`deploy`**
- 认证方式改为**公钥登录**（密钥：`~/.ssh/vasp_deploy`）
- 服务器项目路径从 `/root/VASP-Visualizer` 改为 `/home/deploy/VASP-Visualizer`
- 服务器端 `deploy_to_tencent.sh` 也改为手动 `docker build`，避免 buildx 版本问题

> **注意**：已在 `.gitignore` 中加入 `*.tar.gz` / `*.tgz`，并清理了之前遗留的部署压缩包文件，避免误提交。

#### 方法二：使用旧版自动化脚本（备用）

```bash
cd /Users/a1234/VASP-Visualizer
expect secure_deploy.expect
```

该脚本会自动：
1. 创建服务器目录 `/root/VASP-Visualizer/ssl`
2. 上传 SSL 证书（`ssl/scivisualizer.com.crt` 和 `.key`）
3. 通过 rsync 同步代码（排除 `node_modules`、`.git`、`dist`、`.DS_Store`）
4. 在服务器上执行 `deploy_to_tencent.sh`

#### 方法三：腾讯云控制台 WebShell（当 SSH 不可用时）

**当本地 SSH 无法连接服务器时，使用此方法：**

1. 登录 [腾讯云控制台](https://console.cloud.tencent.com)
2. 进入「云服务器 CVM」→ 找到 IP 为 `43.154.165.254` 的实例
3. 点击「登录」→「VNC 登录」或「WebShell 登录」
4. 在服务器终端执行：

```bash
cd /home/deploy/VASP-Visualizer
./deploy_to_tencent.sh
```

`deploy_to_tencent.sh` 脚本内容（已更新为手动 docker build）：
```bash
# 手动 docker build（避免 buildx 0.17 问题）
docker build -t vasp-visualizer-frontend .
docker build -t vasp-visualizer-backend ./server

# 启动容器（不再重新构建）
docker compose up -d --no-build --force-recreate --remove-orphans

# 验证状态
sleep 5
docker compose ps

# Health check
curl -s http://localhost/api/health
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
Host 43.154.165.254
    User root
    IdentityFile /Users/a1234/.ssh/vasp_deploy
    KexAlgorithms +diffie-hellman-group14-sha1,diffie-hellman-group1-sha1
    HostKeyAlgorithms +ssh-rsa
```

**本地公钥** (`~/.ssh/vasp_deploy.pub`)：
```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFliDryLTJYHWvsAitaSQyq93Ua/fybGUrKMpQZY7tVl a1234@MacBook-Pro-2.local
```

**解决方案**：
- 通过腾讯云 WebShell 在服务器执行：
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
| 2026-03-07 | 腾讯云 WebShell 执行 deploy_to_tencent.sh | ✅ 成功 | 三容器 Up，API 正常 |

---

## 数据持久化

| 数据类型 | 存储位置 | 说明 |
|---------|---------|------|
| 用户数据（JSON） | `server/db.json` → 容器内 `/app/db.json` | 卷挂载，重启不丢失 |
| 上传文件 | `server/uploads/` → 容器内 `/app/uploads` | 卷挂载，重启不丢失 |
| MongoDB 数据 | Docker Volume `mongo-data` | 命名卷，持久化 |

---

## SSL 证书

- **证书路径（本地）**: `ssl/scivisualizer.com.crt` 和 `ssl/scivisualizer.com.key`
- **证书路径（服务器）**: `/root/VASP-Visualizer/ssl/`
- **Nginx 引用**: `/etc/nginx/ssl/scivisualizer.com.crt`
- **当前 CDN**: Cloudflare（HTTPS 也由 Cloudflare 代理，服务器实际接收 HTTP）

---

## 项目目录结构

```
VASP-Visualizer/
├── src/                    # 前端源代码 (React + TypeScript)
├── server/                 # 后端源代码 (Node.js + Express)
│   ├── index.js            # 后端主入口
│   ├── db.json             # 用户数据（持久化）
│   └── uploads/            # 上传文件（持久化）
├── public/                 # 静态资源
├── dist/                   # 构建输出（不上传，Docker 内自动构建）
├── ssl/                    # SSL 证书
├── Dockerfile              # 前端 Docker 镜像构建（多阶段：Node→Nginx）
├── docker-compose.yml      # 三服务编排（frontend + backend + mongo）
├── nginx.conf              # Nginx 配置（HTTP/HTTPS + API 反向代理）
├── deploy_to_tencent.sh    # 服务器端部署脚本
├── secure_deploy.expect    # 本地全量部署脚本（rsync + 远程执行）
├── upload_server_only.expect # 仅更新后端代码脚本
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

# 完整重新部署
./deploy_to_tencent.sh

# 进入 backend 容器 shell
docker exec -it vasp-visualizer-backend-1 sh

# 进入 mongo 容器
docker exec -it vasp-visualizer-mongo-1 mongosh
```

---

*本文件由 AI 助手在 2026-03-07 首次部署成功后自动生成，后续每次部署应更新「历次部署验证记录」表格。*

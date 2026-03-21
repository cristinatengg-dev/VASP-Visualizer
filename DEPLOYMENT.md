# 部署规则（统一约定）

这份文档定义了 SCI Visualizer 的“部署契约”。只要满足这些约定，你可以用任何工具（脚本、IDE、CI、手工 SSH）稳定完成部署。

## 1. 连接与账号

- **服务器**：`43.154.165.254`
- **SSH 端口**：`2222`
- **部署用户**：`deploy`
- **认证方式**：仅用 SSH 公钥（推荐），并限制安全组只放行你的来源 IP

服务器侧要求：
- `deploy` 账号必须 **未锁定**（`passwd -S deploy` 不是 `LK`）
- `deploy` 在 `docker` 组（`id deploy` 包含 `docker`）

## 2. 目录与文件同步

- **远端项目目录**：`/home/deploy/VASP-Visualizer`
- **同步方式**：使用 `rsync` over SSH
- **同步排除**：`.git/`、`node_modules/`、`dist/`

说明：
- 由于服务器可能未启用 SFTP 子系统，`scp` 可能失败；`rsync` over SSH 不依赖 SFTP，优先使用。

## 3. 构建与启动规则

远端在项目目录下执行：

1) 构建镜像（避免 `docker compose build` 对 buildx 版本的依赖差异）：

```bash
docker build -t vasp-visualizer-backend ./server
docker build -t vasp-visualizer-frontend .
```

2) 重启服务（不再触发 compose build）：

```bash
docker compose down
docker compose up -d --no-build --force-recreate --remove-orphans
```

## 4. 健康检查（部署成功判据）

部署成功的判据是服务器本机请求返回 `200`：

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost/api/health
```

## 5. 一键部署脚本（推荐）

本仓库提供了统一入口：[upload_and_deploy.sh](file:///Users/a1234/VASP-Visualizer/upload_and_deploy.sh)

### 5.1 配置方式

复制一份配置文件：

```bash
cp deploy.env.example deploy.env
```

修改 `deploy.env` 中的变量（例如密钥路径、目标目录等）。

### 5.2 执行

```bash
bash upload_and_deploy.sh
```

你也可以覆盖环境变量：

```bash
DEPLOY_HOST=43.154.165.254 DEPLOY_PORT=2222 DEPLOY_USER=deploy DEPLOY_KEY=~/.ssh/vasp_deploy bash upload_and_deploy.sh
```

## 6. 安全建议

- 安全组：只允许你的公网 IP 访问 `2222`，不要对全网开放
- 建议保持 `PasswordAuthentication no`、`PermitRootLogin no`
- 不要把生产密钥/SMTP 密码/Token secret 直接硬编码进仓库；建议迁移到服务器环境变量或私有配置文件

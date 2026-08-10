# 统一生产 Runtime 与任务持久化

## 当前边界

科研工作区中的每个任务现在从创建开始就对应同一个 Runtime Session。任务状态以 `workspace_snapshot` Artifact 的不可变版本链保存，Goal、Plan、TaskRun、JobRun、Event 和后续科研产物继续挂在这一个 Session 下。浏览器 `localStorage` 仅承担启动缓存和服务异常时的离线副本，不再是任务主存储。

服务端写入使用 `snapshotRevision` 乐观锁。两个窗口同时编辑时，后到的旧版本请求得到 `409 snapshot_conflict`，不会静默覆盖服务器数据。归档、恢复和删除也在服务端保存；删除采用软删除，保留审计记录。

## 上线前必需配置

1. 使用支持事务的 MongoDB replica set。仓库根目录的 `docker-compose.yml` 已配置单节点 `rs0`；外部 MongoDB 应在 `RUNTIME_MONGODB_URI` 中带上 `replicaSet` 参数。
2. 将 `RUNTIME_ARTIFACT_STORAGE_DIR` 和 `RUNTIME_JOB_STORAGE_DIR` 放在持久磁盘。Compose 已把 `/app/runtime-storage` 挂到 `runtime-storage` 命名卷。当前文件存储适合单个后端副本；扩展到多副本前需换成共享 POSIX 存储或对象存储适配器。
3. 在 `server/.env` 设置随机且不可提交到仓库的 `TOKEN_SECRET`。登录用户的 Runtime owner 由已签名 token 决定，请求体中的 `ownerId` 不能覆盖登录身份。
4. 首次发布和每次 Runtime schema 增加索引后执行：

   ```bash
   cd server
   npm run runtime:indexes
   ```

   该命令只创建缺失索引，不删除现有索引。Compose 后端启动命令会自动执行它，外部部署仍需把这一步放进发布流程。

## 发布与验证

```bash
docker compose up -d --build
docker compose exec backend npm run runtime:indexes
curl http://127.0.0.1/api/agent/harness/workspace/health
```

健康接口应返回 HTTP 200、`runtime: "ready"`、`mongodb: "ready"` 和 `transactions: "ready"`。若返回 HTTP 503 与 `degraded`，说明 MongoDB 可连接但事务不可用，不应作为生产配置验收。

工作区保存接口：

- `GET /api/agent/harness/workspace/tasks`
- `POST /api/agent/harness/workspace/tasks`
- `PUT /api/agent/harness/workspace/tasks/:sessionId`
- `PATCH /api/agent/harness/workspace/tasks/:sessionId/archive`
- `DELETE /api/agent/harness/workspace/tasks/:sessionId`

前端顶部的“Runtime 已同步 / 保存中 / 离线”显示当前任务的持久化状态。Runtime 不可用时，新科研流程会停止在启动阶段，不会继续产生未归档、不可审计的孤立结果。

## 尚未包含在本轮的能力

- 跨后端副本的对象存储适配器与旧快照垃圾回收。
- `409` 冲突的可视化差异合并；当前策略是保护服务器版本并提示刷新。
- 管理端任务检索、保留策略、备份恢复演练和运行指标告警。

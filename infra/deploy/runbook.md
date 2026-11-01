# 单实例部署与恢复手册

本地产物已准备，不代表远端发布已完成。以下命令在受控部署主机执行；操作前核对环境、版本与目录。服务只绑定宿主机回环端口，由宿主机 HTTPS 反向代理转发，须支持 SSE 持续连接。

## 环境与目录

复制 `infra/deploy/.env.example` 为同目录 `.env.production`，设置真实的 `APP_ORIGIN`、源码提交 `BUILD_REVISION`、`DATA_DIRECTORY`、`BACKUP_DIRECTORY` 和独立密钥。Compose 的变量插值与容器环境均使用此文件：

```bash
chmod 600 infra/deploy/.env.production
# 目录需位于持久化本地磁盘，备份目录使用另一持久化卷或位置。
# 官方 Node 镜像的 node 用户 UID/GID 为 1000；按主机实际用户映射调整。
sudo install -d -m 700 -o 1000 -g 1000 /srv/research-tasks/data /srv/research-tasks-backups

docker compose --env-file infra/deploy/.env.production -f infra/deploy/compose.yml build
docker compose --env-file infra/deploy/.env.production -f infra/deploy/compose.yml up -d
curl --fail http://127.0.0.1:3000/api/v1/ready
```

`APP_ORIGIN` 必须与浏览器实际访问的 HTTPS origin 完全一致。反向代理不要把登录限流使用的连接来源伪装成可被任意请求控制的地址；共享代理的真实 IP 策略应另行验证。

容器作为非 root 用户运行，自动进行迁移并启动提醒调度器。镜像保留现有工作区和运行 CLI 所需依赖；尚未做最小运行依赖裁剪。不要把开发 `.env`、数据库、浏览器测试替身或原型目录加入镜像。

创建账户使用隐藏密码提示，不把密码放在参数中：

```bash
docker compose --env-file infra/deploy/.env.production -f infra/deploy/compose.yml exec app node --import tsx scripts/create-account.ts test-researcher
```

可选变量见根 `.env.example`：DeepSeek 仅在服务端读取密钥；推送需要稳定的 VAPID 密钥对和真实运营联系地址。`REQUEST_LOGS=true` 仅开启请求 ID、路由模板与耗时日志。

## 在线备份

```bash
# 宿主机直接运行应用时，在项目根目录执行（DATABASE_PATH 为当前库）。
corepack pnpm db:backup /separate-backup-volume/pre-upgrade.sqlite
# 容器运行时，/backups 必须映射到独立持久化备份位置。
docker compose --env-file infra/deploy/.env.production -f infra/deploy/compose.yml exec -T app node --import tsx scripts/backup.ts /backups/pre-upgrade.sqlite
```

每次使用新的文件名。命令调用驱动在线备份 API，可在应用运行且存在 WAL 时使用，生成 SQLite 文件及 `.metadata.json`：包含时间、源码版本、迁移名称/校验和、文件 SHA-256。两者应一起保留。备份文件先在私有临时目录生成，经完整性、外键和迁移检查后发布；不覆盖已有文件。

发布完成后应将这两个文件同步到独立存储，并验证权限、保留期限和恢复可用性。不可只复制仍在运行的主 SQLite 文件；JSON/CSV 导出也不能代替此快照。

## 升级、恢复与回退

1. 记录当前源码版本、数据库路径、迁移版本，执行在线备份。新迁移先在副本上演练；表重建还需验证索引和外键。
2. 停止应用和所有写入者，等待进程及数据库连接关闭。不要用一个新实例和旧实例同时写入同一卷。
3. 恢复时提供新路径。命令不接受任何已存在的目标或目标 WAL/SHM 文件，不会原地覆盖运行库。
4. 校验通过后，修改部署文件中的 `DATABASE_PATH` 指向恢复文件；使用与迁移历史相容的版本重启，检查 ready 和实际业务记录。保留旧库以供核对，不手动删除其 sidecar 文件。

```bash
docker compose --env-file infra/deploy/.env.production -f infra/deploy/compose.yml stop app
# run --no-deps 创建一次性离线操作容器，不启动另一个应用服务。
docker compose --env-file infra/deploy/.env.production -f infra/deploy/compose.yml run --rm --no-deps app node --import tsx scripts/restore.ts /backups/pre-upgrade.sqlite /data/restored-release.sqlite
# 编辑 .env.production：DATABASE_PATH=/data/restored-release.sqlite，并选择匹配的 BUILD_REVISION。
docker compose --env-file infra/deploy/.env.production -f infra/deploy/compose.yml up -d --no-build
curl --fail http://127.0.0.1:3000/api/v1/ready
```

非容器部署同样先停服务，运行 `corepack pnpm db:restore BACKUP NEW_PATH`，再切换 `DATABASE_PATH` 并重启。恢复只写新文件，校验备份 SHA、SQLite `integrity_check`、`foreign_key_check` 和与当前代码匹配的迁移前缀。备份若来自较旧版本，后续启动会追加缺失迁移；较新或修改过的迁移历史会拒绝恢复，必须选择相容代码。不要猜测降级 SQL。

若升级后已产生新数据，回退到旧备份会丢失这些写入；先保留故障现场快照，明确可接受的数据窗口。验收失败时保持停写，按备份对应版本恢复，不默认用旧镜像读取新 schema。

## 恢复后的核对

检查会话登录、任务与工作块数量、due 与安排时间、投稿来源 SHA、已读通知、提醒待处理/失败状态、账户导出。调度器会根据持久化队列继续处理到期项；使用通知偏好和隔离测试账户控制演练派发。推送队列具有至少一次重试语义，供应商接受不代表用户已阅读。

目前无实际 Staging 地址，容器构建及真实环境演练需要在具有 Docker 与目标卷的主机完成并记录，不能以本地替身测试代替真实模型或设备验收。

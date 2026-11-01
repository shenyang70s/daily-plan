# 个人 ECS 单机部署（不依赖 Docker）

当前交付目标为个人使用的一台 Linux ECS 云服务器。已确认访问域名 `https://plan.datafab.cn`，目标服务器为 Ubuntu 24.04 x86_64，已有 arxiv/idea 应用和 Caddy。配置按现有 `/srv/<项目>/releases` 目录与独立服务用户约定适配；当前已部署，具体版本与范围见文末实际验收。若指的是 AWS 的容器服务 ECS，需要另行适配，不能直接套用此主机方案。

必需：持久化 SQLite、可靠启动和重启、备份恢复、AI 失败不丢输入且未经确认不写业务数据。Docker、独立 Staging、设备推送和真实网络故障演练为按需选项。应用内通知仍可使用；AI 的受控失败和恢复保护保留测试。

## 主机与访问准备

- 使用支持 systemd 的 Linux；按实际系统安装符合根 package.json 要求的 Node.js（22.14以上的22.x或24以上）、Corepack/pnpm和构建原生驱动所需工具。此ECS使用项目独立的 `/srv/research-tasks/runtime/node`，不修改系统Node或其他应用运行时。服务不依赖root的nvm目录。
- 应用监听 `127.0.0.1:3000`，沿用现有 Caddy 与 systemd。独立站点文件为 `/etc/caddy/sites-enabled/plan.datafab.cn.caddy`，不覆盖 arxiv/idea 站点。`APP_ORIGIN` 必须是浏览器实际访问的准确 HTTPS origin。
- 有域名时，将其 A/AAAA 指向服务器，再配置证书。仅对外开放所需的80/443，SSH端口限定管理员来源；不对公网开放3000或数据库端口。
- 若没有域名，先确定证书或私有访问方案；当前生产入口不接受公网明文 HTTP，不默认关闭该保护。

参考：[Caddy HTTPS 条件](https://caddyserver.com/docs/automatic-https)、[阿里云 ECS 安全组用途](https://help.aliyun.com/zh/ecs/user-guide/security-groups-for-different-use-cases)。这些链接是配置依据，实际规则需要按目标主机检查后设置。

## 目录与账户

默认路径可按目标磁盘调整；改路径时同时调整环境文件及 unit 的 `ReadWritePaths`。

| 路径 | 用途 |
| --- | --- |
| `/srv/research-tasks/releases/<源码提交>` | 该版本完整源码、依赖和构建产物 |
| `/srv/research-tasks/current` | 指向当前版本的符号链接 |
| `/etc/research-tasks/app.env` | 独立环境文件，root:research-tasks，0640 |
| `/var/lib/research-tasks/research-tasks.sqlite` | 应用数据库及 WAL/SHM，目录0700 |
| `/var/backups/research-tasks` | 独立备份目录，0700；可挂载独立数据盘 |

在目标主机执行以下准备，不在开发机照抄安装：

```bash
# 若账户已存在，沿用并核对权限。
id research-tasks || sudo useradd --system --create-home --home-dir /var/lib/research-tasks --shell /usr/sbin/nologin research-tasks
sudo install -d -m 700 -o research-tasks -g research-tasks /var/lib/research-tasks /var/backups/research-tasks
sudo install -d -m 755 /srv/research-tasks/releases
sudo install -d -m 750 -o root -g research-tasks /etc/research-tasks
```

将审核过的源码放入一个新的版本目录并在目标环境构建；或者使用已验证的发布包。此次发布包在ECS核对了摘要、Node v22.23.3/ABI127和原生SQLite驱动后安装；不假定任意机器的node_modules都可跨平台复制。不上传开发.env或直接复制运行中的数据库主文件。以下 `RELEASE` 必须替换为已准备好的真实源码目录：

```bash
RELEASE=/srv/research-tasks/releases/replace-with-commit
sudo chown -R research-tasks:research-tasks "$RELEASE"
sudo -H -u research-tasks /srv/research-tasks/runtime/node/bin/node --version
sudo -H -u research-tasks bash -c 'export PATH=/srv/research-tasks/runtime/node/bin:$PATH; cd "$1" && corepack pnpm install --frozen-lockfile && corepack pnpm build' bash "$RELEASE"
# current 必须是符号链接，升级时先按后文停服；首次安装此链接应尚不存在。
sudo ln -sfnT "$RELEASE" /srv/research-tasks/current
sudo install -m 640 -o root -g research-tasks "$RELEASE/infra/deploy/ecs/.env.example" /etc/research-tasks/app.env
sudoedit /etc/research-tasks/app.env
```

仅首次安装时复制环境示例；升级时保留现有环境文件。填写域名、当前版本 `BUILD_REVISION`、真实 `DEEPSEEK_API_KEY`。不把密钥放命令参数、版本库或公开日志。推送密钥可留空。

## 安装守护与定时备份

```bash
sudo install -m 644 "$RELEASE"/infra/deploy/ecs/systemd/research-tasks* /etc/systemd/system/
sudo systemd-analyze verify /etc/systemd/system/research-tasks.service /etc/systemd/system/research-tasks-backup.service /etc/systemd/system/research-tasks-backup.timer
sudo systemctl daemon-reload
sudo systemctl enable --now research-tasks.service
curl --fail http://127.0.0.1:3000/api/v1/ready
sudo systemctl enable --now research-tasks-backup.timer
sudo systemctl list-timers research-tasks-backup.timer
```

服务自动开机启动，异常退出后5秒重启；一分钟内连续失败达到5次会停止重试，需查日志、修正配置后 `systemctl reset-failed` 并重启。默认日志由 journald 接收；用 `journalctl -u research-tasks -n 100` 排查，不输出环境文件内容。

配置 `Caddyfile.example` 中的域名与 `APP_ORIGIN` 一致，按主机已有代理部署；不要覆盖其他站点或启动第二个抢占端口的代理。Caddy 方案先验证配置，再重载。域名解析、证书及 HTTPS 实际登录必须在目标服务器验收。

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

新库可创建个人账户，密码由终端隐藏输入。若迁移原有 young，按下一节恢复，不重新创建或重新播种数据：

```bash
cd /srv/research-tasks/current
sudo -H -u research-tasks /srv/research-tasks/runtime/node/bin/node --env-file=/etc/research-tasks/app.env --import tsx scripts/create-account.ts young
```

## 备份、迁移和升级

定时备份默认北京时间每天03:00；关机错过后开机会补跑。脚本使用已有在线备份 API，保留 SQLite 与 `.metadata.json`，文件名含时间和进程号，拒绝在数据库目录内放备份，不覆盖已有文件，也不自动删除历史备份。

```bash
sudo systemctl start research-tasks-backup.service
sudo journalctl -u research-tasks-backup.service -n 20
```

备份需定期复制到个人电脑或其他独立存储。仅在同一ECS磁盘的另一目录备份不能防止整机/整盘丢失；当前配置没有自动上传，也不要求采购额外存储。

迁移现有数据时，先在源端执行 `pnpm db:backup`，通过已确认的SSH连接传输快照与元数据到ECS备份目录，再在停服状态恢复到新路径。不要只复制运行中的主数据库文件，不能用 `demo:seed` 替代数据迁移。

升级前备份并验证新版本构建；切换时暂停服务与备份任务，避免多个写入实例或跨版本备份。回退需要保留旧版本与升级前快照，不能默认旧代码能读取新schema。

```bash
sudo systemctl stop research-tasks-backup.timer research-tasks-backup.service research-tasks.service
# 使用与备份迁移历史相容的版本执行恢复；两个文件路径必须替换为实际备份和不存在的新目标。
cd /srv/research-tasks/current
sudo -H -u research-tasks /srv/research-tasks/runtime/node/bin/node --env-file=/etc/research-tasks/app.env --import tsx scripts/restore.ts /var/backups/research-tasks/pre-upgrade.sqlite /var/lib/research-tasks/restored.sqlite
# 停服期间更新 current 链接、app.env 的 DATABASE_PATH/BUILD_REVISION，然后启动。
sudo systemctl start research-tasks.service
curl --fail http://127.0.0.1:3000/api/v1/ready
sudo systemctl start research-tasks-backup.timer
```

恢复到旧快照不包含此后新写入；保留当前库快照并明确可接受的数据窗口后再回退。旧库与sidecar不要手工删除。

## 个人版验收与现状

必需验收：重启后服务可用、手动模拟进程异常后能够重启、HTTPS登录正常、实际数据库持久化、自动备份有产物、恢复后账户/任务/投稿/提醒保持一致、AI失败保留输入且零误执行。进程异常与数据库恢复均先用隔离数据验证，再核对实际服务配置。

个人版现已在目标ECS完成安装、数据迁移、HTTPS证书、应用异常重启、备份手动触发和真实DeepSeek只读调用验收，见[发布记录](../../../docs/releases/2026-11-01-ecs-release.md)。应用和备份timer已开机启用；未重启整台ECS，避免影响另外两个站点。Docker、独立Staging、设备推送和真实网络故障不再阻塞个人版交付。独立代码审查状态单独保留，不以缩小部署范围代替审查。

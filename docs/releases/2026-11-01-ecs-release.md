# 2026-11-01 个人 ECS 发布记录

访问地址：<https://plan.datafab.cn>。部署于用户指定的 Ubuntu 24.04 x86_64 ECS，沿用 arxiv/idea 的 Caddy 与独立 systemd 服务约定，不使用 Docker，不要求独立 Staging。

## 版本与目录

- 发布版本：`20261101-122531042acf`。
- 发布包 SHA-256：`122531042acf5b21bce7853501b44957610e0f3131d1bf37d1e631b700f719ae`。
- 该包包含已验证的工作区变更，以发布包内容摘要标记，不冒充仅由 Git HEAD 构建。`release.json` 同时记录基础提交、工作区变更标志、Node 版本和完整摘要。
- 当前代码：`/srv/research-tasks/current`，指向 `/srv/research-tasks/releases/20261101-122531042acf`。
- 独立运行时：`/srv/research-tasks/runtime/node`，Node v22.23.3，ABI 127；未修改其他项目运行时。
- 配置：`/etc/research-tasks/app.env`，权限0640，root:research-tasks。密钥留在服务器配置中，登录密码未写入部署文件。
- 数据：`/var/lib/research-tasks/research-tasks.sqlite`，权限0600，research-tasks所有。
- 备份：`/var/backups/research-tasks`，包括迁移快照、每日在线快照及元数据。每日北京时间03:00执行，错过后补跑；已手动触发验证成功。异机备份副本由使用者另行保留。
- 应用监听 `127.0.0.1:3000`；Caddy单独站点文件 `/etc/caddy/sites-enabled/plan.datafab.cn.caddy`。

## 实际验收

| 项目 | 结果 |
| --- | --- |
| HTTPS与证书 | 正常；Caddy取得Let's Encrypt证书，客户端验证通过，当前证书有效期至2027-01-30，后续由现有Caddy管理续期 |
| 健康检查 | 公网HTTPS `/api/v1/ready` 与本机端口均返回200 |
| 数据迁移 | 在线快照恢复成功；1个账户、27项任务、4个课题、4条投稿、13个节点、15个工作块保留；原有凭据逐项一致 |
| 登录与会话 | 临时账户通过公网HTTPS登录；会话Cookie含Secure标记 |
| DeepSeek | 实际调用deepseek-flash，返回成功的只读任务查询，约1.14秒；未确认业务写入为0 |
| 数据导出 | HTTPS导出接口按当前临时账户返回正确归属 |
| 异常重启 | 对新应用模拟进程异常退出，systemd从PID32411自动重启为32613；ready恢复，重启计数1 |
| SQLite恢复检查 | 异常重启后integrity_check=ok，foreign_key_check无错误，任务数量仍为27 |
| 开机与备份 | 应用服务、备份timer均enabled；手动备份Result=success、退出码0，SQLite及元数据文件实际存在 |
| 浏览器 | 真实域名1440/600px登录页面、构建资源与布局正常，无运行时错误 |
| 现有站点 | arxiv仍为401认证入口、idea仍为200；两者应用PID未变，Caddy原配置逐字保留，仅新增plan导入 |
| 清理 | 临时验收账户已删除，残留数量0；现有young密码未重置，开发库未覆盖 |

未重启整台ECS，避免影响另外两个应用；“开机启动”验收为unit启用状态与配置检查，不冒充整机重启演练。Docker、独立Staging、设备推送及真实网络故障注入是个人版可选项。本次沿用此前作者复核，独立审查尚未补齐。

维护与恢复见 [个人ECS指南](../../infra/deploy/ecs/README.md)。后续访问使用云端地址；开发机数据库与云端数据库独立，不提供双向同步。

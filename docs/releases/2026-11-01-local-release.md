# 2026-11-01 本地交付记录

后续已按用户批准的个人ECS范围发布，见[实际发布记录](2026-11-01-ecs-release.md)。以下保留为发布前本地验证历史，不代表当前仍未部署。

状态：Task14 的本地交付内容已完成；没有实际 Staging 地址，尚未构建/运行 Docker 镜像、运行远端 CI 或进行生产发布。实际发布产物必须绑定已提交的源码版本；本工作区结果不冒充已发布版本。

## 行为变化

- 看板默认使用可用全宽，顶部只保留标题、精简 AI 输入及工具行；搜索与条件收进“筛选”，批量管理收进“更多”。三个宽度下看板起点均小于320px，筛选弹层在视口内，列表模式保持原有操作。
- 新增在线 SQLite 备份和新路径恢复 CLI。备份与元数据权限为0600，先校验再发布，记录时间、源码版本、迁移与 SHA，刷盘后返回；不覆盖已有文件/sidecar。恢复后由操作人员在停写状态切换数据库路径。
- 新增隔离 E2E 和按路径触发的 CI 配置，以及单实例容器、Compose、环境变量示例、Staging/生产/恢复手册。

## 本地验证

| 检查 | 结果 |
| --- | --- |
| `corepack pnpm typecheck` | 通过：contracts/domain/persistence/API/Web |
| `corepack pnpm build` | 通过；Vite 主包大于500 kB的既有提示仍在 |
| `corepack pnpm typecheck:e2e` | 通过，含测试服务器与备份恢复脚本 |
| `corepack pnpm test:e2e`（指定本机 Chromium 路径） | 10/10通过；模型和会议均为隔离替身 |
| 紧凑看板的追加浏览器检查 | 1440/1180/600px通过：默认折叠、看板靠上、菜单无视口溢出 |
| `corepack pnpm test:recovery` | 5/5通过：在线WAL、拒绝覆盖/损坏、迁移前缀升级、外键和CLI |
| `node --import tsx --test scripts/test/recovery-drill.test.mjs` | 1/1通过：备份→停服→新路径恢复→重启，登录及9类业务/队列记录一致 |
| reminder-delivery、push-delivery、web-routes 定向集成 | 14/14通过：投递/失败恢复及生产深链 |
| CI与Compose YAML | 解析通过；镜像与运行时源码版本一致，宿主机端口仅回环绑定 |
| `git diff --check` | 通过 |

浏览器测试不会读取开发库、重置 young 或调用真实付费模型。已有原型和真实 young 数据未改动。仅进行了作者复核，没有独立审查；此前审查配额不可用，本次没有重试。

## 仍需验收

- 在有 Docker 的主机实际构建镜像并执行健康检查、CLI 与停服恢复；本环境没有 Docker 可执行程序，YAML 校验不等同于镜像可运行证明。
- 配置独立 Staging 主机、HTTPS origin、数据卷、备份位置和测试账户，执行 [验收表](../../infra/deploy/staging.md)，记录实际地址与版本。
- 真实 DeepSeek 网络超时、推送供应商到设备投递、持久化主机重启与备份保留策略仍需目标环境验证。
- 独立代码审查、源码提交与对应授权的发布。

参考：[运行手册](../../infra/deploy/runbook.md)、[生产条件](../../infra/deploy/production.md)。恢复默认使用新路径并停服切换，避免猜测正在使用的数据库；镜像暂保留工作区依赖以支持既有 CLI，未做运行依赖裁剪。

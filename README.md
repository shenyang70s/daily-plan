# Research Tasks

面向个人科研工作的任务、日历、投稿节点与提醒工具。正式应用采用 React / TypeScript、NestJS 和 SQLite，首版按单实例部署。

## 当前实现状态

已建立 Web/API 工程入口、SQLite 连接与同步短事务封装、版本化迁移，以及任务状态、日期和时间冲突基础规则。正式 Web 当前只有服务就绪检查页；登录、任务页面、后台提醒、真实 AI 和 CCF-DDL 导入仍待实现。

本执行环境尚不能下载 npm 依赖，因此 **NestJS/React 启动、正式 better-sqlite3 驱动、完整构建及浏览器流程尚未验证**。依赖版本在实际安装后锁定，当前没有生成锁文件。请勿将现阶段视为可投入使用的 MVP。

原高保真原型保留在 `prototype/`，与正式应用的数据互不混用。

## 目录

- `apps/web/`：React/Vite 应用入口及真实 API 就绪状态页面。
- `apps/api/`：NestJS 应用入口、数据库生命周期、`/api/v1/health` 和 `/api/v1/ready`。
- `packages/contracts/`：Zod 任务输入与基础响应契约。
- `packages/domain/`：任务状态、纯日期、固定偏移时间及日历区间规则。
- `packages/persistence/`：驱动无关的 SQLite 最小连接接口、迁移和短事务。正式启动注入 better-sqlite3。
- `infra/migrations/`：用户、会话、任务、项目、事件、工作块、投稿、提醒、Outbox 和通知的初始表结构。
- `scripts/migrate.ts`：使用正式驱动运行迁移。
- `docs/superpowers/plans/2026-10-30-research-tasks-implementation.md`：完整计划及当前进度。

## 安装和运行

需要 Node.js 22.14 以上的 22.x，或 Node.js 24 以上，以及可访问 npm 的网络。以下应用命令须先安装依赖，尚未在当前环境验证：

```bash
corepack pnpm install
cp .env.example .env
corepack pnpm db:migrate
corepack pnpm dev
```

Web 默认地址 `http://127.0.0.1:5173`，API 默认地址 `http://127.0.0.1:3000`；Vite 将 `/api` 代理至 API。更改 API 的 PORT 时同步调整 Vite 代理。默认数据库为 `var/research-tasks.sqlite`，路径相对仓库根目录，不在静态资源目录中。

依赖安装后可运行 `corepack pnpm build` 和 `corepack pnpm typecheck`。生产构建后由 API 提供 `apps/web/dist/`；入口为 `corepack pnpm --filter @research/api start`。当前未配置生产部署。

## 无需下载依赖的基础验证

```bash
npm run test:foundation
```

该命令使用 Node 自带 TypeScript 类型擦除与 `node:sqlite`，在临时文件中运行真实 SQLite 行为测试；不会写入应用数据库。`node:sqlite` 在 Node 22 中的实验性提示属于运行时提示。正式应用驱动仍为 better-sqlite3；基础验证不等同于正式驱动或 API 集成验收。

用例验证任务状态转换、逾期判断、有效日历日期、AoE 秒精度、半开区间冲突，以及 SQLite 迁移重入/校验、事务回滚、异步事务拒绝、外键、跨用户关联、期限互斥与有界写锁等待。

PT / IANA 地区时区的归一化尚未实现；固定偏移工具会拒绝 PT，不将其误判为 UTC−8。后续按计划接入时间库并验证夏令时歧义。

## 数据与配置

- 数据库启用 WAL、外键、FULL 同步和有界锁等待。事务回调必须同步；模型请求和外部通知不得放在持锁事务内。
- 数据库、WAL/SHM、`.env` 和备份不提交到版本库。原型 `prototype/dist/` 是保留源码，未被构建目录忽略规则排除。
- SQLite 文件需要持久化本地磁盘，不使用网络共享文件或多副本写入。
- 暂无备份恢复命令；运行中的 WAL 数据库不能只复制主文件充当完整备份。计划 Task 14 将实现一致性备份和恢复流程。
- OIDC 和模型配置尚未接入，不填充虚构凭据，不在日志或提交中暴露真实密钥。

## 本地 Git 修复

`prototype/` 应是 `daily-plan/` 仓库中的普通目录。误关联的 `prototype/.git` 已移至 `.git-recovery/prototype-20261030/git`，并保留了验证通过的 `prototype.bundle`，没有删除源码或提交历史。恢复资料已被 `.gitignore` 排除。

若当前执行会话将根 `.git` 遮蔽为只读空目录，请在能访问真实文件系统的宿主机终端执行：

```bash
bash scripts/repair-git.sh https://github.com/shenyang70s/daily-plan.git
```

请使用实际的 `daily-plan` GitHub 地址。脚本先验证目标可访问；已有根仓库只修复 origin 并清理独立的旧 pushurl；根仓库缺失时从目标远程恢复 Git 元数据，同时保留当前文件。脚本保留恢复备份，不 checkout/reset/clean 源码，不提交，也不 push。根 `.git` 仍被只读挂载遮蔽时会拒绝执行。

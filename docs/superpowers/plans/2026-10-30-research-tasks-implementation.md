

# Research Tasks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 默认由当前执行者顺序实施；仅在用户明确要求时启用子代理。

**Goal:** 将现有高保真原型落地为可登录、持久化保存、管理科研任务与时间、可靠派发提醒，并支持确认式 AI 操作的 Web 应用。

**Architecture:** 使用模块化单体 API 和 SQLite，首版以单实例应用部署，提醒调度在同一服务进程中运行。Web 通过 REST 查询和写入，通过 SSE 接收通知及 AI 运行状态。领域服务统一执行业务规则；LLM、外部会议数据和浏览器缓存均不能直接成为业务事实来源。

**Tech Stack:** 按本次选型采用 TypeScript、React、Vite、TanStack Query、NestJS、SQLite、Zod。使用 pnpm workspace；数据库驱动选择 `better-sqlite3`，配合版本化 SQL migration，不引入独立数据库服务或队列服务。前端使用 Vitest / Testing Library，服务端使用 Node 内置测试工具，关键用户流程使用 Playwright。具体依赖版本在工程初始化时核对兼容性并锁定，本计划不预设未经验证的版本。

**Spec:** [系统设计](../../research_tasks_system_source_bundle/research_tasks_system_design_v1.md)，重点参考第 5–10、11.4、12、15–17 章；[前端规范](../../research_tasks_frontend_design_spec_v1.docx)；[现有原型说明](../../../prototype/README.md)。

## 选型更新与适用边界

本次用户确认采用 SQLite。本计划中的存储、事务、调度和部署约定，取代系统设计 V1 中 PostgreSQL、pg-boss、独立 Worker 及对应物理类型的推荐；原系统设计的领域规则、所有权、确认流程与提醒可靠性要求继续适用。本次仅更新实现计划。

认证选型更新：用户明确要求用户名/口令，不采用 OIDC。首版使用 scrypt 口令哈希、服务器端不透明会话及 CSRF 校验，通过服务器终端创建账号，不开放公开注册；该决定替代原系统设计中的 OIDC 推荐。

首版面向个人或小范围、单实例使用。应用与数据库文件位于同一主机的持久化本地磁盘，不通过网络文件系统共享 SQLite 文件，不部署多个写入实例。只有出现跨主机部署或持续写锁竞争影响体验时，才单独评估迁移数据库；不提前实现双数据库适配。

## 当前状态与范围

当前仓库包含设计资料及 `prototype/dist/` 静态原型。原型的 localStorage、固定日期、规则模拟 AI 与演示身份，不是正式系统实现；实现前先针对相关路径复核文件现状。

保留原型供比对，新建 `apps/` 与 `packages/` 实现正式产品。不直接将原型单文件脚本扩展成生产应用，也不在本轮迁移私人浏览器数据。现有 Word/Markdown 设计文档不因工程搭建而重新组织。

MVP 包含：认证与设置、Task / Project CRUD、Today、Inbox、Tasks、Calendar、Submission、应用内通知、服务端提醒、AI 查询与单项写入确认、CCF-DDL 快照/手动导入。任务看板、基础排程确认在闭环稳定后交付。复盘、复杂拆解、双向日历同步、重复任务、邮件通道放入后续版本。

## Global Constraints

- “API 统一前缀 `/api/v1`，采用 JSON。”正式应用采用系统设计第 8 章路由；原型内部函数不作为 API 契约。
- SQLite 中已提交的业务记录是唯一事实来源。所有写操作以实际提交结果为准，不凭 AI 文本显示成功。
- “任务截止时间与实际排程分离。”期限保存 `due_at` 或 `due_date`，工作时间保存到 `task_schedule_blocks`。
- “AI 写操作必须经过提案和确认。”修改官方期限、删除和批量改期执行更严格确认。
- 服务端从会话取得 `user_id`；重要更新使用 `expectedVersion`，写入支持 `Idempotency-Key`。
- 时间点以 UTC epoch 毫秒存入 INTEGER，并保留来源时区 TEXT；纯日期以 `YYYY-MM-DD` TEXT 保存，不模拟 SQLite 不具备的 DATE 类型。AoE / UTC−12、PT 和秒精度遵循系统设计 11.4。
- 前端采用系统 UI 字体、4 px 间距基准、正文 14–15 px、标题 24–28 px；颜色使用前端规范 Token。
- 1440 × 900 为主要验收画布；1180 px 保证完整桌面体验，窄窗收起右侧上下文栏。
- 日历顶部不放“添加安排”；点击具体时段打开预填日期与时间的任务创建表单。收集箱空状态不放重复“添加任务”按钮。
- 仅检查与改动相关的路径；验证与风险相称。除缺陷回归、确实需要验证的行为或用户要求外，不新增测试；不为文案与布局修改增加镜像测试。
- 实施中的每项任务完成后可单独提交；未获得发布指令前只准备可审查的部署产物。实际密钥由环境注入，不写入计划、仓库或示例数据。

## Review Focus

1. 登录用户使用其他用户资源 ID：Task 3、5、7 验证统一返回 404，无读取或写入泄漏。
2. AI 确认重复提交、提案过期或版本落后：Task 10 验证只执行一次，旧提案拒绝且不部分提交。
3. 日期型截止、AoE 与 PT 夏令时：Task 2、7 验证不猜时区、不丢秒、不将日期字符串转为午夜 UTC。
4. 服务在派发前后重启、目标任务刚完成：Task 8 验证通知幂等、可恢复并取消不再适用的提醒。
5. 会议节点 TBD、上游删除或与用户修订冲突：Task 11 验证保持未知、先比较再确认、禁止静默覆盖。

## 目录与边界

以下均为计划创建的路径；执行时按当前实际文件调整，避免创建空壳模块。

```text
apps/
  web/src/
    app/                  # 路由、QueryClient、AppShell
    components/           # CommandBar、TaskRow、Dialog、Toast
    features/             # tasks、calendar、submissions、notifications、ai、settings
    lib/api-client.ts     # 会话请求、错误与并发版本处理
    styles/tokens.css
    locales/zh-CN.ts
  api/src/
    modules/              # identity、tasks、calendar、submissions、reminders、ai、conferences
    common/               # 鉴权、错误、幂等、版本检查
    background/           # scheduler、outbox、delivery、push；随 API 启停
packages/
  contracts/src/          # Zod DTO、分页、错误与 SSE 契约
  domain/src/             # 状态机、时间规则、冲突检查、排程；不依赖 NestJS
  persistence/src/        # SQLite 连接、同步短事务、按用户隔离的 repository
infra/
  migrations/             # 有序 SQL migration
  docker/                 # 单实例应用镜像与本地持久化卷
  deploy/                 # Staging/Production 配置和运维说明
scripts/                  # migration、SQLite 在线备份、环境检查
tests/e2e/                # 登录后的关键用户闭环
```

不预先抽取 `packages/ui`；组件先放 Web，出现真实复用需求再拆。领域类型不直接暴露数据库实体。

## 实施进度（2026-10-30）

- 依赖已由用户安装，pnpm 10.11.0 和锁文件可用，根仓库 origin 为 daily-plan。当前沙箱仍无法创建 Git 分支（ref 写入失败），未创建嵌套仓库或替代 Git 元数据，未提交/推送。
- Task 1：工程入口、迁移命令、环境示例、完整类型检查和前后端构建已验证。沙箱禁止监听 TCP 端口；实际 NestJS health/readiness 路由通过内存 HTTP 请求验证，本机浏览器和 Staging 仍待验收。
- Task 2：SQLite 迁移、短事务、外键/WAL、有界写锁、正式 better-sqlite3 驱动均已验证。Task 3 的用户名/口令迁移采用新增 SQL，不修改历史 migration。地区时区转换适配在 Task 6 接入 Temporal；已验证 PT/AoE、秒精度、夏令时缺失/重复时刻及明确偏移。固定偏移工具继续拒绝 PT。
- Task 3：用户名/口令登录、退出、12 小时会话、Cookie、CSRF、失败限流、用户偏好 API、账号创建 CLI 和 React 登录/偏好页面已有实现。真实 SQLite 服务测试及 NestJS 路由测试通过；浏览器流程仍待验收，不标记 Staging 完成。
- 基础检查为 `npm run test:foundation`；正式驱动/认证集成为 `corepack pnpm test:integration`。测试使用隔离临时库，不创建演示生产账号。
- Task 4：应用壳层、正式路由、页面导航搜索、通知入口、分组设置、模态弹窗和提示条已实现；本地真实浏览器已验证登录与偏好、导航和历史、生产深链刷新、焦点与键盘，以及 1440、1180、900、600 px 布局。业务通知数据和 Staging 仍待接入/验收。
- Task 5：任务与课题 CRUD、Today/Inbox/Tasks、详情编辑、筛选与游标分页、完成/重新打开/归档、软删除确认和 24 小时恢复已实现。写入在短事务中校验所有权、版本和幂等键；课题删除保留任务并递增受影响任务版本。Today 采用用户时区，包含未排程但今天到期的任务；改期限不创建或移动工作块。共享包、API 与 Web 构建通过；任务 HTTP 集成和既有认证/页面回退检查通过，Web 的 5 项检查通过。隔离 SQLite 与真实浏览器验证了完整任务/课题流程、刷新恢复、筛选、409 保留输入、删除撤销、响应丢失后幂等重试、账户隔离与四种窗口尺寸。未使用模拟业务数据替代正式实现。
- Task 6：日/周/月日历、日期/精确期限读模型、固定事件及关联准备任务、已有任务工作块、新任务与工作块原子创建、编辑/取消和详情深链已实现。写入事务内检查冲突，签名确认凭据绑定候选时间、当前用户和冲突版本；旧确认拒绝且无部分写入。工作块与期限分别保存，Task reschedule 已支持 deadline/blocks/both。Temporal 0.5.1 已锁定，日历按需加载。共享包/API/Web 构建、地区时区 2 项、原领域 5 项、Web 7 项与日历/任务/认证/页面路由 4 项定向检查通过。真实浏览器验证创建、准备任务原子性、相接不冲突、变化后的冲突重新确认、日周月、深链刷新、工作块编辑/取消不改期限、切换时区、夏令时拒绝及明确偏移、跨用户隔离和四种尺寸；截图检查后修复已占时段新增入口与桌面周日列裁切。
- Task 7–14：未开始；投稿、提醒和 AI 仍待接入，Staging 验收保持待完成。

## 阶段与验收里程碑

| 里程碑 | 任务 | 可交付结果 | 进入下一阶段的门槛 |
|---|---|---|---|
| M0：可登录骨架 | 1–3 | 本地与 Staging 可登录，数据库可迁移 | 会话、退出与用户隔离通过 |
| M1：任务与时间闭环 | 4–7 | 六个主要页面对接真实数据 | CRUD、重载恢复、排期与期限分离 |
| M2：可靠提醒 | 8 | 关闭浏览器仍可服务端调度 | 重启恢复、幂等、取消与重试通过 |
| M3：AI 与会议来源 | 9–11 | 真实 AI 提案、确认执行、CCF-DDL 手动导入 | 未确认零写入，来源更改不覆盖本地修订 |
| M4：首版交付 | 12–14 | 基础排程、数据导出/删除、可部署版本 | 核心 E2E、恢复与发布检查通过 |

主依赖：1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14。Task 9 的提供商接入配置可在 M1 后单独准备，但其执行仍等待领域服务与确认机制就绪。

下列命令均为**待建立的实施契约**，不是宣称仓库当前已有脚本。Task 1 创建对应 scripts；每个后续任务只运行列出的定向检查。计划编写阶段不安装依赖、不运行产品测试。

## Task 1：可启动的工程骨架

**Files:** 创建 `package.json`、`pnpm-workspace.yaml`、`tsconfig.base.json`、`.env.example`、`apps/{web,api}/package.json`、`apps/api/src/{main.ts,app.module.ts}`、`apps/api/src/health/health.controller.ts`、`apps/web/src/main.tsx`、`infra/docker/compose.yaml`、`scripts/migrate.ts`。

**Interfaces:** 建立包名 `@research/web`、`@research/api`、`@research/contracts`、`@research/domain`、`@research/persistence`。`GET /api/v1/health` 返回 `{status:'ok'}`；数据库文件不可读写、迁移版本不匹配或后台调度初始化失败时 readiness 返回 503。`pnpm dev` 启动本地进程，`pnpm db:migrate` 执行有序 migration。

- [ ] 初始化 workspace、Web/API 两个开发入口及本地 SQLite 文件；`DATABASE_PATH` 指向 `./var/research-tasks.sqlite`，文件位于静态资源目录之外。配置 `.gitignore` 排除数据库、WAL/SHM 和备份；示例环境变量只含占位符。生产由 API 同时提供构建后的 Web 静态资源。
- [ ] 配置 Web 的 `test`（Vitest），其余包的 `test`（Jest），API 的 `test:integration`，根目录 `typecheck`、`build`、`test:e2e`。集成测试使用测试运行专属临时目录下的独立 SQLite 文件；清理前校验真实路径位于该目录，拒绝操作应用数据库。涉及 WAL、锁与恢复的用例不能用 `:memory:` 替代。
- [ ] 运行 `pnpm dev`，请求 health/readiness，并运行 `pnpm typecheck` 和 `pnpm build`。验收：Web 可访问；文件权限或数据库初始化故障时 readiness 正确失败；初始构建成功。
- [ ] 提交：`chore: bootstrap application workspace`。

## Task 2：共享契约、时间模型与数据库事务

**Files:** 创建 `packages/contracts/src/{task,calendar,submission,common}.ts`、`packages/domain/src/{time,task-state,calendar-conflict}.ts`、`packages/persistence/src/{database,transaction}.ts`、`packages/persistence/src/database.spec.ts`、`infra/migrations/001_identity_tasks_calendar.sql`、`002_submissions_reminders.sql`；测试位于对应包的 `src/*.spec.ts`。

**Interfaces:** `LocalDate` 为校验后的 `YYYY-MM-DD`；`TaskDue = {kind:'date';date:LocalDate} | {kind:'instant';at:string;timezone:string} | null`。`withTransaction<T>(fn:(tx:Transaction)=>T):T` 作为同步短事务入口，事务回调禁止返回 Promise 或执行网络请求。AI 调用和 Push 投递在事务外完成；读取校验与最终状态变更在短事务内进行。工作块采用 `startAt/endAt/timezone`，不在 Task 上另存可漂移的第二套排期。

- [ ] 为 `normalizeDeadline({localDateTime, timezone}): {at:string;timezone:string}`、日期截止及状态机写行为用例：`2026-11-10 23:59:59 AoE` 对应 `2026-11-11T11:59:59Z`；洛杉矶 2026-03-08 02:30 不存在，2026-11-01 01:30 有歧义时必须拒绝或要求明确偏移；日期字符串不转换为时间点。先确认针对用例失败。
- [ ] 实现 DTO、状态转换与时间工具；按系统设计第 6 章的逻辑模型创建 SQLite migration：ID 使用 TEXT UUID，布尔值使用 INTEGER 0/1，结构化快照使用经 Schema 校验的 JSON TEXT；截止日期 TEXT 与截止时刻 INTEGER 互斥，保留索引、版本号和用户外键。时间库在本任务锁定，不使用手写夏令时算法。
- [ ] 每个连接启用并回读验证 `foreign_keys=ON`、`journal_mode=WAL`、`synchronous=FULL`、`busy_timeout=5000`；关键读后写操作使用 `BEGIN IMMEDIATE` 短事务，不能使用 PostgreSQL 的 `FOR UPDATE` 或 `SKIP LOCKED`。锁等待超时回滚并返回可重试错误，不无限等待或重放包含外部副作用的操作。
- [ ] 用两个连接到同一临时文件验证外键拒绝孤儿记录、事务异常完整回滚、写锁等待有界、锁释放后可正常写入，以及迁移重复执行不重复建表。运行 `pnpm --filter @research/persistence test --runInBand src/database.spec.ts`、`pnpm --filter @research/domain test --runInBand src/time.spec.ts src/task-state.spec.ts`，以及 `pnpm db:migrate` 对空临时库的迁移检查；要求全部成功。
- [ ] 提交：`feat: define task contracts and persistence model`。

## Task 3：用户名/口令认证、会话与用户设置

**Files:** 创建 `apps/api/src/modules/identity/{identity.module,identity.service,password,auth.controller,session.guard}.ts`、`apps/api/src/common/{app-error,api-error.filter}.ts`、`infra/migrations/003_password_credentials.sql`、`scripts/create-account.ts`、`apps/web/src/features/auth/SignInPage.tsx`、`apps/web/src/features/settings/GeneralSettings.tsx`；测试 `apps/api/test/integration/{identity,auth-http}.test.mjs`、`scripts/test/account-cli.sh`。

**Interfaces:** `SessionContext={userId:string;sessionId:string;csrfToken:string}`。账号通过 `corepack pnpm account:create <username>` 创建，口令从隐藏交互或标准输入读取；不提供公开注册接口。`POST /auth/login`、`POST /auth/logout`、`GET /me`、`GET/PATCH /me/preferences` 均位于 `/api/v1`。业务数据 owner 来自会话，不来自请求正文。

- [ ] 验证未登录返回 401；错误及未知账号统一失败；失败过多限流；口令只保存随机盐 scrypt 哈希；会话令牌只存哈希；退出及过期后失效；其他用户偏好隔离。
- [ ] 实现 12 小时 HttpOnly/SameSite 会话 Cookie，生产开启 Secure；修改请求同时检查精确 Origin 和会话绑定 CSRF，生产要求 HTTPS APP_ORIGIN。不得将口令或令牌写入日志。
- [ ] 实现 React 登录和偏好页面，登录后从服务端读取实际身份，退出清理 Query Cache；登录失败保留可重试表单，不伪造身份。
- [ ] 运行 `corepack pnpm test:integration`，包含真实 SQLite、认证服务、内存 HTTP 和 CLI 用例；宿主机终端创建账号后运行 `corepack pnpm dev` 验证浏览器登录/退出。Staging 未配置时明确保持待验收。
- [ ] 提交：`feat: add password sessions and user preferences`；仅在 Git 写权限恢复后提交，不以其他路径绕过沙箱限制。

## Task 4：应用壳层与正式页面路由

**Files:** 创建 `apps/web/src/app/{router,AppShell,query-client}.tsx`、`apps/web/src/lib/api-client.ts`、`apps/web/src/styles/tokens.css`、`apps/web/src/locales/zh-CN.ts`、`apps/web/src/components/{Dialog,Toast,EmptyState}.tsx`。

**Interfaces:** `apiRequest<T>(path:string, options:RequestInit):Promise<T>` 统一处理 401、API 错误、409 和中止；Query key 使用 `[resource,userId,filters]`，退出清理用户缓存。路由遵循前端规范：`/today`、`/inbox`、`/tasks`、`/tasks/:taskId`、`/calendar`、`/submissions`、`/submissions/:submissionId`、`/settings/*`。

- [x] 将原型的 Token、布局和交互约束迁入 React；路由显示实际加载/错误/空状态，尚未实现的数据页不能显示伪造成功。
- [x] 将页面导航搜索和通知入口接入壳层；Dialog 管理焦点、Esc 和键盘循环；中文文案集中管理。通知数据等待 Task 8。
- [x] 运行 `pnpm --filter @research/web build`；真实浏览器在 1440、1180、900、600 px 检查布局、导航、键盘焦点和浏览器前进/后退，以及生产深链刷新。
- [ ] 提交：`feat: implement application shell and routes`。

## Task 5：任务 CRUD、Today、Inbox 与 Tasks

**Files:** 创建 `apps/api/src/modules/tasks/{tasks.controller,tasks.service,tasks.module,projects.controller,pagination}.ts`、`packages/persistence/src/{task,project,idempotency}.repository.ts`、`apps/api/src/common/idempotency.ts`、`apps/web/src/features/tasks/{TasksPage,TaskDetailPanel,TaskQuickCreate,TaskEditor,TaskActions,ProjectManager}.tsx`、`apps/web/src/components/TaskRow.tsx`、`apps/web/src/styles/tasks.css`；测试 `apps/api/test/integration/tasks.test.mjs`。Today/Inbox/Tasks 复用按 view 参数区分的 TasksPage。

**Interfaces:** 使用设计第 8.2 章任务路由；补充 `/projects` 基础 CRUD。`TasksService.create(ctx:SessionContext,input:CreateTaskInput,key:string):TaskDto` 使用同步 SQLite 短事务，控制器直接返回提交结果；幂等逻辑放在事务内部，避免拦截器使响应记录与写入分开提交。`reschedule` 显式传递 `scope:'deadline'|'blocks'|'both'` 和 `expectedVersion`；本任务实现 deadline，blocks/both 在 Task 6 前明确拒绝。只填标题创建 Inbox；未安排且今天到期的任务也出现在 Today。软删除与撤销通过受鉴权的 `POST /tasks/{id}/restore` 补充契约，恢复期限 24 小时。

- [x] 为标题必填、任务筛选/分页、同键重复创建返回同 ID、不同请求体复用键拒绝、跨用户 ID 返回 404、旧版本返回 409 编写并运行失败用例。
- [x] 实现领域服务和页面：快速新增、类型/状态/优先级/日期过滤、完成/恢复、归档、详情编辑、软删除确认与服务端撤销；界面等待提交结果，不提前伪造成功，失败保留输入。请求重试复用幂等键，成功后刷新相关用户的缓存。
- [x] 运行 `corepack pnpm build:shared`、API/Web 构建、`node --test apps/api/test/integration/{tasks,auth-http,web-routes}.test.mjs` 和 `corepack pnpm --filter @research/web test`；真实浏览器核对 Today 仅展示相关任务、收集箱空状态保留快速输入且无额外添加按钮，并验证完整任务/课题流程与响应丢失后的重试。
- [ ] 提交：`feat: deliver persistent task workflow`。

## Task 6：日历事件、工作块与延期

**Files:** 创建 `apps/api/src/modules/calendar/{calendar.controller,calendar.service,calendar.module,schedule-blocks.controller}.ts`、`packages/persistence/src/calendar.repository.ts`、`packages/domain/src/calendar-time.ts`、`apps/web/src/features/calendar/{CalendarPage,CalendarGrid,CalendarForm,EventDetailPanel}.tsx`；测试 `apps/api/test/integration/calendar.test.mjs`、`packages/domain/test/integration/calendar-time.test.mjs`。沿用 `packages/domain/test/task-rules.test.mjs` 中的半开区间检查。

**Interfaces:** 第 8.3 章 API；`CalendarItem={kind:'event'|'block'|'milestone';resourceId:string;startAt?:string;endAt?:string;date?:LocalDate;timezone:string}`。`findConflicts(candidate:TimeRange,existing:TimeRange[]):Conflict[]` 采用半开区间 `[start,end)`，前后相接不冲突。

- [x] 为工作块与固定会议重叠、跨日、边界相接、只移动 block 不改变 due、跨用户查询编写并运行失败用例。
- [x] 实现日/周/月读模型、会议及关联准备任务；点击时段创建带日期/时间的 Task + block，事务内完成。仅设置 due 不创建 block。冲突必须提示并获得明确确认；重新提交时检查当前冲突版本，不复用过期快照。
- [x] 运行共享包/API/Web 构建，`node --test packages/domain/test/integration/calendar-time.test.mjs`、`node --experimental-strip-types --test packages/domain/test/task-rules.test.mjs`、`corepack pnpm --filter @research/web test` 和 API 日历/任务/认证/页面回退定向检查；真实浏览器验证点击时段、详情深链、无顶部添加按钮、时区/夏令时及四种尺寸布局。1440/1180 px 下七天完整显示，900/600 px 周网格在容器内滚动。
- [ ] 提交：`feat: add calendar events and schedule blocks`。

## Task 7：投稿阶段、节点和时区展示

**Files:** 创建 `apps/api/src/modules/submissions/{submissions.controller,submissions.service,milestones.controller}.ts`、`packages/persistence/src/submission.repository.ts`、`apps/web/src/features/submissions/{SubmissionsPage,SubmissionDetailPanel,MilestoneList}.tsx`；测试 `apps/api/test/integration/submissions.spec.ts`。

**Interfaces:** 第 8.4 章 API；`SubmissionMilestone` 使用 Task 2 的日期/时刻语义，补充 `sourceUrl`、`sourceTimezone`、`verifiedAt` 和 `version`。节点可为 unknown，不把空值默认为今天。`nextMilestone(submission,now)` 使用可注入时钟，正式页面不沿用原型固定日期。

- [ ] 为摘要/全文分开存储、秒精度、AoE/PT 转换、来源保留、阶段变更不改官方时间、跨用户节点访问写失败用例并运行。
- [ ] 实现投稿 CRUD、阶段流转、节点编辑确认、倒计时和来源显示；同时显示原始时区与用户本地时间，截止后显示已截止。列表、日历与通知共用同一时刻格式化函数。
- [ ] 运行 `pnpm --filter @research/api test:integration --runInBand test/integration/submissions.spec.ts`；浏览器手动验证两种用户时区下同一节点代表相同瞬间。
- [ ] 提交：`feat: add submission milestones with source timezones`。

## Task 8：持久化提醒、通知中心与进程内调度

**Files:** 创建 `apps/api/src/modules/reminders/{reminders.controller,notifications.controller,reminders.service}.ts`、`packages/persistence/src/{reminder,outbox,notification}.repository.ts`、`apps/api/src/background/{scheduler,outbox,delivery,push}.ts`、`apps/web/src/features/notifications/{NotificationCenter,ReminderEditor}.tsx`；测试 `apps/api/test/integration/reminder-delivery.spec.ts`。

**Interfaces:** 第 8.5 章 API；`ReminderJob={reminderId:string;scheduledFor:string;deliveryKey:string}`。`deliveryKey` 由 reminder、触发时间和渠道组成并受唯一约束保护；`deliver(job):Promise<'sent'|'skipped'|'retry'>`。业务事务只写提醒与 Outbox；进程内 Scheduler 定期扫描到期项，在短事务中通过条件 UPDATE 领取，记录 `status`、`lease_until`、`attempts`、`next_attempt_at`。投递在事务外执行，完成后短事务确认；过期租约重启可恢复，失败采用有上限退避并进入可查询失败状态。

- [ ] 用可注入 Clock 验证到期触发、用户静音、已完成/取消目标跳过、同一 job 重复执行不新增通知，以及领取后崩溃仍可恢复；先运行用例确认失败。
- [ ] 实现与 NestJS 生命周期绑定的单个 Scheduler、SQLite Outbox、应用内通知、已读/稍后提醒与 SSE；轮询完成后再启动下一轮，避免重叠扫描。定时器只负责唤醒，执行状态持久化，不使用内存队列作为唯一记录。断开 SSE 后以 GET 回补，不能只依赖长连接。发送前再次检查目标状态与版本，重算日期变更后的待触发提醒。纯日期截止仅在用户明确设置提醒时刻和时区后计算触发时间，不自动推导午夜提醒。
- [ ] 为目标浏览器提供可选 Web Push：用户显式授权后绑定 endpoint，失效 endpoint 停用；未授权仍能查看应用内通知。不把外部 Push 供应商的投递等同用户已阅读。应用内通知由唯一键保证去重；外部 Push 采用至少一次重试，使用稳定消息标识辅助去重，不承诺远端严格只投递一次。
- [ ] 运行 `pnpm --filter @research/api test:integration --runInBand test/integration/reminder-delivery.spec.ts`；Staging 关闭浏览器并重启应用服务，核对到期提醒仍被处理且通知不重复。
- [ ] 提交：`feat: deliver durable reminders and notifications`。

## Task 9：真实 AI 解析与只读查询

**Files:** 创建 `apps/api/src/modules/ai/{ai.controller,orchestrator,provider-adapter,context-builder,tool-registry}.ts`、`packages/contracts/src/ai.ts`、`apps/web/src/features/ai/{CommandBar,AIResult,AIProgress}.tsx`；测试 `apps/api/src/modules/ai/orchestrator.spec.ts`。

**Interfaces:** `ModelProvider.interpret(input:InterpretContext):Promise<InterpretResult>`；`InterpretResult={kind:'query';result:QueryResult}|{kind:'clarification';question:string}|{kind:'proposal';proposal:ProposalDraft}`。接入一个支持结构化输出的真实提供商；测试使用固定替身。只读工具为查询当前用户任务、日历与投稿，写工具仅产生动作草案。

- [ ] 验证结构化返回不合法时拒绝、缺少关键日期时追问、查询只读、提供商超时保留输入、外部链接内容不自动读取、其他用户内容不进入上下文；先运行失败用例。
- [ ] 实现 `/ai/interpret`、最小上下文、白名单、Token/超时上限、SSE 运行进度、Cmd/Ctrl + K；不将模型 Key 发送给 Web。模糊的“晚上”等表达不能静默补成精确时刻。
- [ ] 运行 `pnpm --filter @research/api test --runInBand src/modules/ai/orchestrator.spec.ts`；真实提供商只做一次人工冒烟，核对查询成功、普通 CRUD 不依赖模型可用性。
- [ ] 提交：`feat: add model-backed interpretation and read tools`。

## Task 10：提案确认、幂等执行和审计

**Files:** 创建 `apps/api/src/modules/ai/{proposal.service,proposal-executor,proposal.controller}.ts`、`packages/persistence/src/{proposal,audit}.repository.ts`、`infra/migrations/003_ai_proposals_audit.sql`、`apps/web/src/features/ai/AIActionPreview.tsx`；测试 `apps/api/test/integration/ai-confirmation.spec.ts`。

**Interfaces:** `Proposal={id:string;userId:string;actions:Action[];resourceVersions:Record<string,number>;expiresAt:string;status:ProposalStatus}`。初始白名单仅 `task.create`、`task.update`、`task.reschedule`；创建提案本身不写业务表。`confirm(ctx,proposalId,expectedVersion,key):Promise<ExecutionResult>` 对接第 8.6 章路由。

- [ ] 编写失败用例：未确认零业务写入；同提案并发确认只执行一次；过期、越权、旧版本提案拒绝；用户取消零写入；一项动作校验失败则整组回滚。
- [ ] 实现结构化预览、编辑后重新校验、确认/拒绝和事务执行；审计记录动作摘要与来源，不保存模型隐式推理。结果返回真实资源 ID 后再更新界面；禁止模型直接执行 SQL/代码/任意 URL。
- [ ] 运行 `pnpm --filter @research/api test:integration --runInBand test/integration/ai-confirmation.spec.ts`；人工走通“自然语言 → 预览 → 修改字段 → 确认 → 刷新仍存在”，并核对双击不重复创建。
- [ ] 提交：`feat: execute confirmed AI proposals atomically`。

## Task 11：CCF-Deadlines 快照与手动导入

**Files:** 创建 `apps/api/src/modules/conferences/{conference-source,conference-import.service,conferences.controller}.ts`、`packages/persistence/src/conference-source.repository.ts`、`packages/contracts/src/conference.ts`、`infra/migrations/004_conference_sources.sql`、`apps/web/src/features/submissions/ConferenceImportPreview.tsx`、`apps/api/test/fixtures/conferences/{iclr,cvpr,unknown}.yml`；测试 `apps/api/test/integration/conference-import.spec.ts`。

**Interfaces:** `ConferenceSource.loadSnapshot(input:{yaml:string;fileUrl:string;officialUrl:string;commitSha:string;fetchedAt:string}):ConferenceSnapshot`。补充 `POST /conferences/import-preview` 和 `POST /conferences/import-proposals/{id}/confirm`；前者创建可持久化比较提案，后者复用 Task 10 的版本、权限、幂等和事务基础设施。远端记录身份采用 `{conferenceId,year,round,nodeType}`。

- [ ] 用锁定版本的 YAML fixture 验证四类节点映射、TBD 不生成时刻/提醒、AoE/PT 保留语义、缺少 timezone 拒绝确认、重复导入不重复生成、手动修订冲突需显式决定、上游删除不自动删除本地节点；先运行失败用例。
- [ ] 实现受限 YAML 解析、字段校验、来源快照、变更比较与确认导入。MVP 输入可信本地快照/手动提供的数据，不接受任意 URL 服务端抓取，不以 prototype 中未锁定 SHA 的日期冒充可追溯正式源。
- [ ] 保留原始日期、秒、来源 timezone、抓取时间、commit SHA、文件与官网链接；上游约定默认值与官方明确值在预览中区分，无法判断的标为待核实。确认更新后才重算提醒，不覆盖未选择接受的用户字段。
- [ ] 运行 `pnpm --filter @research/api test:integration --runInBand test/integration/conference-import.spec.ts`；验收导入后来源可查、取消无业务更改，网络中断不影响已有投稿记录。
- [ ] 提交：`feat: import conference deadline snapshots with confirmation`。

## Task 12：基础计划建议与轻量管理

**Files:** 创建 `packages/domain/src/scheduling.ts`、`apps/api/src/modules/ai/planning.service.ts`、`apps/web/src/features/ai/SchedulePreview.tsx`、`apps/web/src/features/tasks/{TaskBoard,BatchActions}.tsx`；测试 `packages/domain/src/scheduling.spec.ts`。

**Interfaces:** `suggestSchedule(input:{tasks:SchedulableTask[];fixed:TimeRange[];workingHours:WorkingHours;timezone:string;now:string}):ScheduleSuggestion` 返回建议工作块、冲突与未安排原因。`POST /ai/plan` 只保存提案；`schedule_block.create/update` 及批量任务动作经过 Task 10 扩展的白名单和确认执行；删除使用 `task.delete`，必须携带二次确认凭据。批量动作也使用同一事务机制。

- [ ] 为高优先级临期任务、空档不足、会议不可覆盖、工作时间外、纯日期期限、跨日和重复请求写失败用例；时间不足时应列出未安排任务而不是压缩或改写官方期限。
- [ ] 实现确定性空档检测与可编辑预览；AI 可解释方案但不直接选定最终安排。提供轻量看板和批量状态/延期，预览明确影响数量，批量删除二次确认。
- [ ] 实现日历拖拽为工作块调整预览；拖拽和点击表单调用同一服务，保存成功才显示已确认。撤销需要反向动作并校验版本，不能用旧快照覆盖他人更新。
- [ ] 运行 `pnpm --filter @research/domain test --runInBand src/scheduling.spec.ts`；人工验收生成计划前后固定会议、官方期限保持一致，取消后无工作块写入。
- [ ] 提交：`feat: add confirmable scheduling and batch task actions`。

## Task 13：数据导出、账户删除与必要运行信息

**Files:** 创建 `apps/api/src/modules/account/{export.service,deletion.service,account.controller}.ts`、`apps/web/src/features/settings/{GeneralSettings,NotificationSettings,AISettings,IntegrationSettings,AccountDataSettings}.tsx`、`apps/api/src/common/observability.ts`；测试 `apps/api/test/integration/account-data.spec.ts`。

**Interfaces:** 补充 `GET /account/export?format=json|csv`、`DELETE /account`；删除须重验身份和显式确认。偏好读写使用 Task 3 的 `/me/preferences`。IntegrationSettings 只显示实际接入状态，不能提供可点击但无行为的连接按钮。

- [ ] 验证导出仅含当前用户数据、账户删除后会话/提醒/订阅失效、其他用户数据保留、未确认不能删除，先运行失败用例。
- [ ] 实现 JSON/CSV 导出、分组设置和删除流程；提供提醒调度积压、失败投递、AI 失败率及耗时、普通 API 延迟的基础观测。日志默认脱敏，不记录密钥和完整私人任务。
- [ ] 运行 `pnpm --filter @research/api test:integration --runInBand test/integration/account-data.spec.ts`；在 Staging 使用测试账户完成导出与删除核对。
- [ ] 提交：`feat: add account data controls and operational visibility`。

## Task 14：核心 E2E、可恢复部署与交付

**Files:** 创建 `tests/e2e/{tasks,calendar,ai,submissions,notifications}.spec.ts`、`playwright.config.ts`、`infra/docker/app.Dockerfile`、`scripts/{backup,restore}.ts`、`infra/deploy/{staging,production,runbook}.md`、`.github/workflows/ci.yml`、根目录 `README.md`；修改 `AGENTS.md` 中项目结构和实际可用命令，保留全部核心原则。

**Interfaces:** 单实例应用容器提供 Web/API 与提醒调度，SQLite 文件位于挂载的持久化本地卷；Local、Staging、Production 使用独立文件、身份回调和密钥。不使用无持久化磁盘的托管运行时，不把数据库文件放入镜像，不以多副本共享文件方式扩容。发布产物绑定源码提交，migration 使用 Expand/Contract，变更前能备份，失败可回退兼容的应用版本；涉及 SQLite 表结构重建的迁移显式验证索引、外键与现有数据。正式应用部署目标独立于 prototype 的 Sites 项目身份；具体云服务由部署环境决定。

- [ ] 建立隔离 E2E 用户与测试库，覆盖：标题创建→收集箱→安排→Today→完成；点击日历时段创建且不改 due；AI 未确认零写入和确认后重载；CCF 导入不覆盖手动修订；通知稍后提醒/已读。
- [ ] 配置 CI 按变更路径执行类型、领域/模块测试、必要集成测试和构建；跨模块发布候选运行上述核心 E2E。Lint 不作为本轮额外强制检查；若未来设为团队标准，再更新脚本与 AGENTS.md。不添加无条件全量重复测试。
- [ ] 本任务因覆盖数据库、后台任务、鉴权与前端集成，执行 `pnpm typecheck`、`pnpm build` 和 `pnpm test:e2e`；另外仅运行尚未通过或受最终集成影响的模块测试，不机械重跑此前全部检查。
- [ ] 建立 `pnpm db:backup` 和 `pnpm db:restore`：备份使用驱动在线备份 API 产生一致快照，不直接复制运行中的主数据库文件。恢复前停写并关闭数据库连接，将备份恢复到新文件并进行 `integrity_check`、`foreign_key_check` 和迁移版本检查，通过后替换并重启服务。备份存放在运行卷之外，保留备份时间和版本；任务 JSON/CSV 导出不替代数据库备份。
- [ ] 在 Staging 演练空库迁移、已有库升级、SQLite 备份恢复、应用服务重启、模型超时和 Push 失败；记录与此次变更无关的既有失败，不顺带修复无关模块。
- [ ] 用浏览器按 1440 × 900、1180 px 和窄窗检查 Today、空收集箱、AI 预览、任务侧栏；验证日期及时区一致、焦点可达和退出后缓存清除。记录真实验证范围。
- [ ] 输出可审查的发布说明、环境变量清单、迁移/回退命令和 Staging 地址。实际公开/生产发布在获得对应授权后执行；本实现计划本身不触发发布。
- [ ] 提交：`chore: prepare verified release and deployment runbook`。

## 首版完成标准与停止条件

- 数据库为持久化 SQLite 文件，单实例应用随服务启动调度；文件备份恢复和锁竞争处理已有验证记录。
- 正式 Web 使用实际当前时间和用户时区，不依赖原型演示日期或 localStorage 作为唯一持久层。
- 用户能在不同页面完成创建、安排、完成、延期、删除/恢复，刷新和重新登录后数据一致。
- 提醒由持久化服务端任务触发；模型不可用不影响手工管理任务。
- 所有写操作遵守所有权、版本与幂等约束；AI 提案未经确认无业务更改。
- CCF-DDL 来源、时区、秒和源版本可追溯；TBD 不猜测；用户修订受保护。
- 与本次交付相关的检查通过，Staging 核心闭环和恢复路径有可核查记录。

满足以上标准即停止首版实施。每日/每周复盘、复杂任务拆解、外部日历同步、邮件、重复任务和后台自动抓取 CCF-DDL，应分别形成有明确验收的小计划，不在首版完成后顺带扩展。

## 开始实施时的配置输入

实施 Task 1–2 不需要这些外部配置，可先完成本地闭环；后续任务使用隔离替身验证规则，并在接入真实服务前补齐：

- Task 3：已确定用户名/口令；运行时由管理员创建账号，并配置各环境准确的 APP_ORIGIN。无需 OIDC 提供商或客户端密钥。
- Task 9：选定的模型提供商、模型、密钥及预算/配额；不得用模拟解析冒充真实接入完成。
- Task 14：带持久化本地磁盘的单实例 Staging/Production 运行环境、域名、SQLite 文件路径和独立备份位置。环境未提供时交付本地产物与部署说明，并明确真实环境验收尚未完成。

本计划只定义实现顺序和交付标准，不代表上述服务已选定、已部署或已授权采购。


## SQLite 实施参考

以下文档用于核对驱动和存储行为；本计划中的文件路径、超时及单实例限制是本项目的实施决定。

- [SQLite WAL](https://www.sqlite.org/wal.html)：读写并发和同主机部署边界。
- [SQLite PRAGMA](https://www.sqlite.org/pragma.html)：外键、日志、同步与锁等待配置。
- [SQLite Online Backup](https://www.sqlite.org/backup.html)：在线一致性备份。
- [better-sqlite3 API](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md)：同步事务和驱动备份接口。

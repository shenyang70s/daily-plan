# AI native 工作流实施计划

设计：../specs/2026-10-31-ai-native-workflows-design.md。用户已要求执行检查建议，直接在当前工作目录实施，保留既有修改。使用 brainstorming/writing-plans/executing-plans 的设计、计划和逐项验证方法；不重复请求已授权工作审批，不提交/推送，不修改真实账户业务数据。

- [x] 1. 契约与持久化：新增 parentRunId、页面资源范围、plan/actions/execution DTO；迁移保存上下文/父轮次、执行与审计。先写 schema/执行 API 回归观察失败。
- [x] 2. 真实上下文与连续修改：在 context-builder 中建立有界 owner 快照及八轮历史；在 orchestrator 中验证父方案、资源和模型引用，输出不可变方案；按工作时间/真实日历为新任务建议空档。
- [x] 3. 确认执行：新 plan-executor.ts 通过事务适配器调用现有领域服务，执行白名单，处理 new:N 引用、记录前后影响、原子回滚、版本、唯一确认与旧方案失效。
- [x] 4. 统一 UI：CommandBar 支持 parentRunId/资源上下文、所有入口统一 PlanPreview，方案卡片/继续修改/确认结果；业务页自然语言入口，手工兜底保留。
- [x] 5. 验证与文档：定向 API/共享契约/前端测试、构建、隔离浏览器与一次合成真实 DeepSeek 调用；README 明确实际能力及边界。

接口：AiOrchestrator.start(ctx,{text,requestId,intent,parentRunId?,scope?},key) -> runId；confirm(ctx,runId,key) -> AiExecutionDto；AiPlanExecutor.prepare(ctx,actions,snapshot) -> actions + impacts；execute(ctx,runId,key) -> 同事务执行结果。最多12项动作，父历史最多8轮，上下文数量和日期边界固定且向用户展示。

重点验证：跨用户父轮次/资源引用拒绝；新方案替代旧方案；事务中途失败不留下任务/提醒/outbox/审计；版本变化与新增冲突不能强制覆盖；重复确认及响应丢失不重复创建；查询/追问零业务写入；多轮更改与真实上下文不会越界泄露；上下文截断可见。适当扩大回归到涉及的日历、任务、投稿、提醒服务，不运行无关推送/CLI 检查。


完成记录：共享包/API/Web 构建通过；9项 AI native、5项 AI 编排、1项 AI HTTP、1项日历、7项任务/投稿/提醒回归，共23项API检查通过；12项Web检查通过。Chromium 临时SQLite和固定模型验证 Today 自动解析一次、多轮缩短、创建后继续修改同一记录、旧方案失效、事件+提醒、投稿+准备任务、详情作用域、追问承接、超时恢复输入、取消零写入、600/1440px布局及手工兜底/导航。真实DeepSeek合成调用返回有效事件+开始前提醒方案。所有检查使用临时账户/数据库，实际业务数据未修改。

一次独立代码复核发现并修正：前端额外 parent 字段、推理期间版本变化错误绑定到新版本、执行后历史遗漏实际ID，以及预览遗漏备注/地点/准备任务等写入。对应定向回归已先失败后通过；另补预览时段已经开始的拒绝用例。没有提交、推送或发布。运行已有版本的服务需重启以加载迁移009和确认端点。

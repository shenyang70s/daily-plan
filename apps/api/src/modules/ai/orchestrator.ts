import { createManualPlan } from './manual-plan.js';
import { undoExecution } from './undo-execution.js';
import { randomUUID } from 'node:crypto';
import type { BeforeApplicationShutdown, OnApplicationBootstrap } from '@nestjs/common';
import { AiDecisionSchema } from '@research/contracts';
import type { AiConfigDto, AiInterpretResult, AiRunDto, AiPlan, AiExecutionDto, ManualPlanInput } from '@research/contracts';
import { normalizeDeadline, calendarTimezone } from '@research/domain';
import type { Database } from '@research/persistence';
import type { SessionContext, IdentityService } from '../identity/identity.service.js';
import type { ModelProvider } from './provider-adapter.js';
import { researchSnapshot, interpretContext } from './context-builder.js';
import type { AiScope, AiHistoryTurn } from './context-builder.js';
import { AiPlanExecutor } from './plan-executor.js';
import { ReadTools } from './tool-registry.js';
import { AppError } from '../../common/app-error.js';
import { writeResource } from '../../common/idempotency.js';
const terminal = (status: string) => ['succeeded', 'failed', 'canceled'].includes(status);
export class AiOrchestrator implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly active = new Map<string, { controller: AbortController; promise: Promise<void> }>();
  private stopping = false;
  constructor(private readonly db: Database, private readonly identity: IdentityService, private readonly provider: ModelProvider, private readonly tools: ReadTools, private readonly now: () => number = Date.now) {}
  onApplicationBootstrap(): void { this.db.withTransaction(tx => tx.run("UPDATE ai_runs SET status='failed',phase='failed',error_code='AI_INTERRUPTED',error_message='服务已重启，请重新解析；未执行任何业务修改',updated_at=? WHERE status IN ('queued','running')", this.now())); }
  async beforeApplicationShutdown(): Promise<void> { this.stopping = true; for (const value of this.active.values()) value.controller.abort(); await Promise.allSettled([...this.active.values()].map(value => value.promise)); }
  config(ctx: SessionContext): AiConfigDto { return { configured: this.provider.configured, enabled: this.identity.getPreferences(ctx).ai, provider: 'deepseek', model: this.provider.model }; }
  get(ctx: SessionContext, id: string): AiRunDto {
    const row = this.db.get('SELECT * FROM ai_runs WHERE id=? AND user_id=?', id, ctx.userId);
    if (!row) throw new AppError(404, 'AI_RUN_NOT_FOUND', '找不到这次 AI 解析');
    return { id: String(row.id), execution: this.execution(ctx, id), superseded: !!this.db.get('SELECT id FROM ai_runs WHERE parent_run_id=? AND user_id=?', id, ctx.userId), status: row.status as AiRunDto['status'], phase: row.phase as AiRunDto['phase'], result: row.result_json ? JSON.parse(String(row.result_json)) as AiInterpretResult : null, error: row.error_code ? { code: String(row.error_code), message: String(row.error_message) } : null };
  }
  private execution(ctx: SessionContext, id: string): AiExecutionDto | null { const row = this.db.get('SELECT result_json FROM ai_executions WHERE run_id=? AND user_id=?', id, ctx.userId); return row ? JSON.parse(String(row.result_json)) as AiExecutionDto : null; }
  confirm(ctx: SessionContext, id: string, key: string, token?: string, acknowledgement?: string): AiExecutionDto { this.permitted(ctx, this.db.get('SELECT origin FROM ai_runs WHERE id=? AND user_id=?', id, ctx.userId)?.origin !== 'manual'); return new AiPlanExecutor(this.db, this.identity, this.now).execute(ctx, id, key, token, acknowledgement); }
  plan(ctx: SessionContext, input: ManualPlanInput, key: string): AiRunDto { this.permitted(ctx, false); return this.get(ctx, createManualPlan(this.db, this.identity, ctx, input, key, this.now()).runId); }
  deletionConfirmation(ctx: SessionContext, id: string, key: string) { this.permitted(ctx, false); return new AiPlanExecutor(this.db, this.identity, this.now).deletionConfirmation(ctx, id, key); }
  undo(ctx: SessionContext, id: string, key: string) { this.permitted(ctx, false); return undoExecution(this.db, this.identity, ctx, id, key, this.now()); }
  private history(ctx: SessionContext, parent?: string): AiHistoryTurn[] {
    const turns: AiHistoryTurn[] = []; let id = parent;
    for (let i = 0; id && i < 8; i++) {
      const row = this.db.get('SELECT input_text,result_json,parent_run_id FROM ai_runs WHERE id=? AND user_id=?', id, ctx.userId);
      if (!row) throw new AppError(404, 'AI_RUN_NOT_FOUND', '找不到此前的对话');
      const result = row.result_json ? JSON.parse(String(row.result_json)) : null;
      if (result?.kind === 'plan') { delete result.impacts; delete result.contextSummary; delete result.dependencies; }
      turns.unshift({ text: String(row.input_text), result, executed: !!this.execution(ctx, id), execution: this.execution(ctx, id) }); id = row.parent_run_id == null ? undefined : String(row.parent_run_id);
    }
    return turns;
  }
  private permitted(ctx: SessionContext, requireAi = true): void {
    if (!this.db.get('SELECT id FROM sessions WHERE id=? AND user_id=? AND revoked_at IS NULL AND expires_at>?', ctx.sessionId, ctx.userId, this.now())) throw new AppError(401, 'UNAUTHENTICATED', '会话已失效，请重新登录');
    if (requireAi && !this.identity.getPreferences(ctx).ai) throw new AppError(403, 'AI_DISABLED', 'AI 功能已关闭，可在设置中开启');
  }
  start(ctx: SessionContext, input: { text: string; requestId: string; intent?: 'assist' | 'capture'; parentRunId?: string | undefined; scope?: AiScope | undefined }, key: string): { runId: string } {
    this.permitted(ctx);
    if (!this.provider.configured) throw new AppError(503, 'AI_NOT_CONFIGURED', 'DeepSeek 尚未配置，请设置服务端 DEEPSEEK_API_KEY');
    if (input.parentRunId && !this.db.get('SELECT id FROM ai_runs WHERE user_id=? AND request_id=?', ctx.userId, input.requestId)) {
      const parent = this.get(ctx, input.parentRunId);
      if (!terminal(parent.status)) throw new AppError(409, 'AI_PARENT_PENDING', '请等待上一轮完成');
      if (parent.superseded) throw new AppError(409, 'AI_PLAN_SUPERSEDED', '请基于最新一轮继续修改');
    }
    if (input.scope) researchSnapshot(this.db, this.identity, ctx, this.now(), input.scope);
    let created = false;
    const result = writeResource(this.db, ctx.userId, 'ai:interpret', key, input, tx => {
      const previous = tx.get('SELECT id,input_text,intent,parent_run_id,scope_json FROM ai_runs WHERE user_id=? AND request_id=?', ctx.userId, input.requestId);
      if (previous) { if (previous.input_text !== input.text || previous.intent !== (input.intent ?? 'assist') || (previous.parent_run_id ?? undefined) !== input.parentRunId || (previous.scope_json ?? null) !== (input.scope ? JSON.stringify(input.scope) : null)) throw new AppError(409, 'AI_REQUEST_CONFLICT', '该请求标识已用于其他输入'); return { runId: String(previous.id) }; }
      if (this.stopping || this.active.size >= 2) throw new AppError(429, 'AI_BUSY', 'AI 正在处理其他请求，请稍后重试');
      if (tx.get("SELECT id FROM ai_runs WHERE user_id=? AND status IN ('queued','running')", ctx.userId)) throw new AppError(429, 'AI_BUSY', '上一条解析尚未结束，请先等待或停止');
      const recent = Number(tx.get('SELECT count(*) n FROM ai_runs WHERE user_id=? AND created_at>?', ctx.userId, this.now() - 60000)?.n ?? 0);
      if (recent >= 5) throw new AppError(429, 'AI_RATE_LIMIT', '每分钟最多解析五次，请稍后重试');
      if (Number(tx.get('SELECT count(*) n FROM ai_runs WHERE user_id=? AND created_at>?', ctx.userId, this.now() - 3600000)?.n ?? 0) >= 60) throw new AppError(429, 'AI_RATE_LIMIT', '本小时 AI 请求已达上限，请稍后重试');
      const id = randomUUID();
      tx.run('DELETE FROM ai_runs WHERE created_at<? AND NOT EXISTS (SELECT 1 FROM ai_executions WHERE run_id=ai_runs.id)', this.now() - 86400000);
      tx.run("INSERT INTO ai_runs(id,user_id,session_id,request_id,input_text,intent,parent_run_id,scope_json,status,phase,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,'queued','queued',?,?)", id, ctx.userId, ctx.sessionId, input.requestId, input.text, input.intent ?? 'assist', input.parentRunId ?? null, input.scope ? JSON.stringify(input.scope) : null, this.now(), this.now());
      created = true; return { runId: id };
    });
    if (created) {
      const controller = new AbortController(), promise = Promise.resolve().then(() => this.perform(ctx, result.runId, input.text, controller.signal, input.intent ?? 'assist', input.parentRunId, input.scope)).finally(() => this.active.delete(result.runId));
      this.active.set(result.runId, { controller, promise });
    }
    return result;
  }
  private phase(id: string, phase: string): void { this.db.withTransaction(tx => tx.run("UPDATE ai_runs SET status='running',phase=?,updated_at=? WHERE id=? AND status IN ('queued','running')", phase, this.now(), id)); }
  private async perform(ctx: SessionContext, id: string, text: string, signal: AbortSignal, intent: 'assist' | 'capture', parent?: string, scope?: AiScope): Promise<void> {
    try {
      this.permitted(ctx); this.phase(id, 'interpreting');
      const timezone = this.identity.getPreferences(ctx).timezone;
      const research = researchSnapshot(this.db, this.identity, ctx, this.now(), scope), history = this.history(ctx, parent);
      this.db.withTransaction(tx => tx.run('UPDATE ai_runs SET context_json=? WHERE id=? AND user_id=?', JSON.stringify(research), id, ctx.userId));
      const raw = await this.provider.interpret({ ...interpretContext(text, timezone, this.now(), intent), research, history }, signal);
      if (signal.aborted) throw new AppError(409, 'AI_CANCELED', '已停止本次解析');
      this.permitted(ctx);
      const parsed = AiDecisionSchema.safeParse(raw);
      if (!parsed.success) throw new AppError(502, 'AI_INVALID_OUTPUT', '模型返回了不支持的字段或格式，请修改描述后重试');
      const decision = parsed.data; let result: AiInterpretResult;
      if (intent === 'capture' && !['plan', 'proposal', 'clarification'].includes(decision.kind)) result = { kind: 'clarification', question: '请描述想新增并安排的任务，例如“明天14点阅读论文一小时”。' };
      else if (decision.kind === 'plan') {
        const prepared = new AiPlanExecutor(this.db, this.identity, this.now).prepare(ctx, decision.actions, research);
        result = { ...decision, ...prepared, contextSummary: research.summary };
      }
      else if (decision.kind === 'clarification') result = decision;
      else if (decision.kind === 'proposal') {
        const clockExplicit = /(?:\d{1,2}[:：]\d{2}|[\d一二两三四五六七八九十]+\s*[点时])/.test(text);
        const ambiguous = /(?:晚上|下午|上午|中午|早上|早晨|傍晚|今晚|明晚|稍后|过几天)/.test(text) && !clockExplicit;
        const vagueDay = /(?:下周|本周|下个月|近期)/.test(text) && !/(?:周[一二三四五六日天]|\d{1,2}[日号]|\d{4}-\d{2}-\d{2})/.test(text);
        if (ambiguous || vagueDay || decision.draft.due?.kind === 'local' && !clockExplicit) result = { kind: 'clarification', question: '请补充具体日期和钟点；如果只需要日期期限，请明确说明“仅日期”，也可不设期限放入收集箱。' };
        else {
          const { due, ...fields } = decision.draft;
          try {
            if (due?.kind === 'local' && due.timezone !== timezone && !text.includes(due.timezone)) throw new Error('Timezone not specified');
            const normalized = due?.kind === 'local' ? { kind: 'instant' as const, ...normalizeDeadline(due) } : due;
            if (normalized?.kind === 'instant') new Intl.DateTimeFormat('en', { timeZone: calendarTimezone(normalized.timezone) }).format();
            let schedule;
            if (intent === 'capture' && decision.schedule) {
              if (!clockExplicit || decision.schedule.timezone !== timezone && !text.includes(decision.schedule.timezone)) throw new Error('Explicit work time required');
              const start = normalizeDeadline({ localDateTime: decision.schedule.localStart, timezone: decision.schedule.timezone }), end = normalizeDeadline({ localDateTime: decision.schedule.localEnd, timezone: decision.schedule.timezone });
              if (Date.parse(start.at) < this.now() || Date.parse(end.at) <= Date.parse(start.at) || Date.parse(end.at) - Date.parse(start.at) > 86400000) throw new Error('Invalid work range');
              schedule = { startAt: start.at, endAt: end.at, timezone: start.timezone };
            }
            result = { ...(schedule ? { schedule } : {}), kind: 'proposal', draft: { ...fields, due: normalized, projectId: null, externalUrl: null }, assumptions: decision.assumptions, executable: false };
          } catch { result = { kind: 'clarification', question: '请明确有效的截止日期、钟点和时区；夏令时重复或缺失时刻不能自动推断。' }; }
        }
      } else { this.phase(id, 'querying'); result = this.tools.query(ctx, decision, timezone, this.now()); }
      if (result.kind === 'proposal') {
        const actions = [{ kind: 'task_create' as const, task: result.draft, autoSchedule: true, ...(result.schedule ? { schedule: result.schedule } : {}) }];
        const prepared = new AiPlanExecutor(this.db, this.identity, this.now).prepare(ctx, actions, research);
        result = { kind: 'plan', title: '安排新任务', explanation: '根据你的描述和当前工作时间安排任务。', assumptions: result.assumptions, ...prepared, contextSummary: research.summary };
      }
      this.db.withTransaction(tx => tx.run("UPDATE ai_runs SET status='succeeded',phase='completed',result_json=?,updated_at=? WHERE id=? AND user_id=? AND status IN ('queued','running')", JSON.stringify(result), this.now(), id, ctx.userId));
    } catch (error) {
      const safe = error instanceof AppError ? error : new AppError(502, 'AI_FAILED', 'AI 解析暂时失败，输入已保留，请稍后重试');
      this.db.withTransaction(tx => tx.run("UPDATE ai_runs SET status=?,phase=?,error_code=?,error_message=?,updated_at=? WHERE id=? AND user_id=? AND status IN ('queued','running')", signal.aborted ? 'canceled' : 'failed', signal.aborted ? 'canceled' : 'failed', safe.code, safe.message, this.now(), id, ctx.userId));
    }
  }
  cancel(ctx: SessionContext, id: string, key: string): AiRunDto {
    const result = writeResource(this.db, ctx.userId, `ai:${id}:cancel`, key, {}, tx => {
      const row = tx.get('SELECT status FROM ai_runs WHERE id=? AND user_id=?', id, ctx.userId);
      if (!row) throw new AppError(404, 'AI_RUN_NOT_FOUND', '找不到这次 AI 解析');
      if (!terminal(String(row.status))) tx.run("UPDATE ai_runs SET status='canceled',phase='canceled',error_code='AI_CANCELED',error_message='已停止本次解析',updated_at=? WHERE id=? AND user_id=?", this.now(), id, ctx.userId);
      return { id };
    });
    this.active.get(id)?.controller.abort(); return this.get(ctx, result.id);
  }
}

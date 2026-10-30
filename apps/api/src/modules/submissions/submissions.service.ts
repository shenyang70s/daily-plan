import { randomUUID } from 'node:crypto';
import { calendarTimezone, normalizeDeadline, nextMilestone } from '@research/domain';
import { submissionRecord, submissionRecords, milestoneRecord, milestoneRecords, insertSubmissionRecord, updateSubmissionRecord, submissionConferenceSource } from '@research/persistence';
import type { Database, Transaction, Row, SqlValue } from '@research/persistence';
import type { ConferenceCandidate, CreateSubmissionInput, UpdateSubmissionInput, SubmissionListInput, CreateMilestoneInput, UpdateMilestoneInput, SubmissionDto, MilestoneDto } from '@research/contracts';
import type { SessionContext, IdentityService } from '../identity/identity.service.js';
import { AppError } from '../../common/app-error.js';
import { writeResource } from '../../common/idempotency.js';
import { paginate } from '../tasks/pagination.js';
type Reader = Pick<Transaction, 'get' | 'all'>;
const iso = (value: unknown) => new Date(Number(value)).toISOString();
const text = (value: unknown): string | null => value == null ? null : String(value);

export class SubmissionsService {
  constructor(private readonly db: Database, private readonly identity: IdentityService, private readonly now: () => number = Date.now) {}
  private submission(reader: Reader, ctx: SessionContext, id: string, writable = false): Row {
    const row = submissionRecord(reader, ctx.userId, id);
    if (!row) throw new AppError(404, 'SUBMISSION_NOT_FOUND', '找不到这条投稿');
    if (writable && row.archived_at != null) throw new AppError(422, 'SUBMISSION_ARCHIVED', '请先恢复投稿，再修改内容或节点');
    return row;
  }
  private milestone(reader: Reader, ctx: SessionContext, id: string, writable = false): Row {
    const row = milestoneRecord(reader, ctx.userId, id);
    if (!row) throw new AppError(404, 'MILESTONE_NOT_FOUND', '找不到这个截止节点');
    this.submission(reader, ctx, String(row.submission_id), writable); return row;
  }
  private version(row: Row, expected: number) { if (row.version !== expected) throw new AppError(409, 'VERSION_CONFLICT', '记录已更新，请刷新最新版本'); }
  private milestoneDto(row: Row): MilestoneDto {
    return { id: String(row.id), submissionId: String(row.submission_id), kind: row.kind as MilestoneDto['kind'], due: row.due_date != null ? { kind: 'date', date: String(row.due_date) } : row.due_at != null ? { kind: 'instant', at: iso(row.due_at), timezone: String(row.timezone) } : null, sourceTimezone: text(row.source_timezone), sourceUrl: text(row.source_url), officialUrl: text(row.official_url), verifiedAt: row.verified_at == null ? null : iso(row.verified_at), createdAt: iso(row.created_at), updatedAt: iso(row.updated_at), version: Number(row.version) };
  }
  private dto(reader: Reader, ctx: SessionContext, row: Row): SubmissionDto {
    const milestones = milestoneRecords(reader, ctx.userId, String(row.id)).map(item => this.milestoneDto(item));
    const imported = submissionConferenceSource(reader, ctx.userId, String(row.id));
    const candidate = imported ? (JSON.parse(String(imported.snapshot_json)) as { candidate: ConferenceCandidate }).candidate : null;
    return { id: String(row.id), name: String(row.name), year: row.year == null ? null : Number(row.year), round: text(row.round), stage: row.stage as SubmissionDto['stage'], submissionUrl: text(row.submission_url), draftUrl: text(row.draft_url), nextAction: String(row.next_action), archivedAt: row.archived_at == null ? null : iso(row.archived_at), createdAt: iso(row.created_at), updatedAt: iso(row.updated_at), version: Number(row.version), conferenceSource: candidate ? { candidateId: candidate.id, conferenceId: candidate.conferenceId, title: candidate.title, year: candidate.year, round: candidate.round, commitSha: candidate.commitSha, filePath: candidate.filePath, fileUrl: candidate.fileUrl, fetchedAt: candidate.fetchedAt } : null, milestones, nextMilestone: row.archived_at != null ? null : nextMilestone(milestones, this.now(), this.identity.getPreferences(ctx).timezone) };
  }
  get(ctx: SessionContext, id: string) { return this.dto(this.db, ctx, this.submission(this.db, ctx, id)); }
  list(ctx: SessionContext, query: SubmissionListInput) {
    const items = submissionRecords(this.db, ctx.userId).filter(row => (row.archived_at != null) === (query.archived === 'true') && (!query.stage || row.stage === query.stage) && (!query.year || row.year === query.year) && (!query.q || `${row.name}\n${row.round ?? ''}\n${row.next_action}`.toLocaleLowerCase().includes(query.q.toLocaleLowerCase()))).map(row => this.dto(this.db, ctx, row));
    return paginate(items, query.limit, query.cursor);
  }
  create(ctx: SessionContext, input: CreateSubmissionInput, key: string) {
    return writeResource(this.db, ctx.userId, 'submissions:create', key, input, tx => this.createInTransaction(tx, ctx, input));
  }
  getInTransaction(tx: Transaction, ctx: SessionContext, id: string) { return this.dto(tx, ctx, this.submission(tx, ctx, id)); }
  createInTransaction(tx: Transaction, ctx: SessionContext, input: CreateSubmissionInput): SubmissionDto {
    const id = randomUUID(), now = this.now();
    insertSubmissionRecord(tx, 'submission', { id, user_id: ctx.userId, name: input.name, year: input.year, round: input.round, stage: input.stage, submission_url: input.submissionUrl, draft_url: input.draftUrl, next_action: input.nextAction, created_at: now, updated_at: now });
    return this.dto(tx, ctx, this.submission(tx, ctx, id));
  }
  update(ctx: SessionContext, id: string, input: UpdateSubmissionInput, key: string) {
    return writeResource(this.db, ctx.userId, `submissions:${id}:update`, key, input, tx => {
      const row = this.submission(tx, ctx, id, true); this.version(row, input.expectedVersion);
      const values: Record<string, SqlValue> = { updated_at: this.now() };
      const fields = { name: 'name', year: 'year', round: 'round', stage: 'stage', submissionUrl: 'submission_url', draftUrl: 'draft_url', nextAction: 'next_action' } as const;
      for (const [key, column] of Object.entries(fields)) { const value = input[key as keyof typeof fields]; if (value !== undefined) values[column] = value; }
      updateSubmissionRecord(tx, 'submission', ctx.userId, id, values); return this.dto(tx, ctx, this.submission(tx, ctx, id));
    });
  }
  archive(ctx: SessionContext, id: string, input: { expectedVersion: number }, key: string, restore = false) {
    return writeResource(this.db, ctx.userId, `submissions:${id}:${restore ? 'restore' : 'archive'}`, key, input, tx => {
      const row = this.submission(tx, ctx, id); this.version(row, input.expectedVersion);
      if (restore && row.archived_at == null) throw new AppError(422, 'NOT_ARCHIVED', '这条投稿没有被归档');
      updateSubmissionRecord(tx, 'submission', ctx.userId, id, { archived_at: restore ? null : row.archived_at == null ? this.now() : Number(row.archived_at), updated_at: this.now() });
      return this.dto(tx, ctx, this.submission(tx, ctx, id));
    });
  }
  listMilestones(ctx: SessionContext, id: string) { this.submission(this.db, ctx, id); return { items: milestoneRecords(this.db, ctx.userId, id).map(row => this.milestoneDto(row)) }; }
  private milestoneValues(input: CreateMilestoneInput | UpdateMilestoneInput, previous?: Row): Record<string, SqlValue> {
    const values: Record<string, SqlValue> = {};
    try {
      if (input.kind !== undefined) values.kind = input.kind;
      if (!previous || input.due !== undefined || input.localDeadline !== undefined) {
        let due = input.due ?? null;
        if (input.localDeadline) { const normalized = normalizeDeadline({ localDateTime: input.localDeadline.localDateTime, timezone: input.localDeadline.timezone, ...(input.localDeadline.offset ? { offset: input.localDeadline.offset } : {}) }); due = { kind: 'instant', ...normalized }; values.source_timezone = input.sourceTimezone ?? input.localDeadline.timezone; }
        values.due_date = due?.kind === 'date' ? due.date : null;
        values.due_at = due?.kind === 'instant' ? Date.parse(due.at) : null;
        values.timezone = due?.kind === 'instant' ? calendarTimezone(due.timezone) : null;
        if (!input.localDeadline && input.sourceTimezone === undefined && !previous) values.source_timezone = due?.kind === 'instant' ? due.timezone : null;
      }
      if (input.sourceTimezone !== undefined && !input.localDeadline) values.source_timezone = input.sourceTimezone;
      const effectiveAt = values.due_at === undefined ? previous?.due_at : values.due_at;
      const source = values.source_timezone === undefined ? previous?.source_timezone : values.source_timezone;
      if (effectiveAt != null && source != null) calendarTimezone(String(source));
      for (const [key, column] of Object.entries({ sourceUrl: 'source_url', officialUrl: 'official_url' } as const)) { const value = input[key as 'sourceUrl' | 'officialUrl']; if (value !== undefined || !previous) values[column] = value ?? null; }
      if (input.verifiedAt !== undefined || !previous) values.verified_at = input.verifiedAt == null ? null : Date.parse(input.verifiedAt);
    } catch { throw new AppError(400, 'INVALID_DEADLINE', '请检查来源时区与截止时间；夏令时重复时刻需要有效偏移，不存在的时刻不能保存'); }
    return values;
  }
  private bumpParent(tx: Transaction, ctx: SessionContext, id: string) { updateSubmissionRecord(tx, 'submission', ctx.userId, id, { updated_at: this.now() }); }
  createMilestone(ctx: SessionContext, id: string, input: CreateMilestoneInput, key: string) {
    return writeResource(this.db, ctx.userId, `submissions:${id}:milestone:create`, key, input, tx => this.createMilestoneInTransaction(tx, ctx, id, input));
  }
  createMilestoneInTransaction(tx: Transaction, ctx: SessionContext, id: string, input: CreateMilestoneInput): MilestoneDto {
    const submission = this.submission(tx, ctx, id, true); this.version(submission, input.expectedSubmissionVersion);
    const milestoneId = randomUUID(), now = this.now();
    insertSubmissionRecord(tx, 'milestone', { id: milestoneId, user_id: ctx.userId, submission_id: id, ...this.milestoneValues(input), created_at: now, updated_at: now });
    this.bumpParent(tx, ctx, id); return this.milestoneDto(this.milestone(tx, ctx, milestoneId));
  }
  updateMilestone(ctx: SessionContext, id: string, input: UpdateMilestoneInput, key: string) {
    return writeResource(this.db, ctx.userId, `milestones:${id}:update`, key, input, tx => {
      const row = this.milestone(tx, ctx, id, true); this.version(row, input.expectedVersion);
      const values = this.milestoneValues(input, row);
      if (!input.confirmDeadlineChange) throw new AppError(409, 'DEADLINE_CONFIRMATION_REQUIRED', '请先核对节点与来源的前后变化，再确认修改', { before: this.milestoneDto(row), after: this.milestoneDto({ ...row, ...values }) });
      updateSubmissionRecord(tx, 'milestone', ctx.userId, id, { ...values, updated_at: this.now() });
      this.bumpParent(tx, ctx, String(row.submission_id)); return this.milestoneDto(this.milestone(tx, ctx, id));
    });
  }
  deleteMilestone(ctx: SessionContext, id: string, input: { expectedVersion: number; confirm: true }, key: string) {
    return writeResource(this.db, ctx.userId, `milestones:${id}:delete`, key, input, tx => {
      const row = this.milestone(tx, ctx, id, true); this.version(row, input.expectedVersion);
      tx.run('DELETE FROM submission_milestones WHERE user_id=? AND id=?', ctx.userId, id); this.bumpParent(tx, ctx, String(row.submission_id)); return { id, deleted: true };
    });
  }
}

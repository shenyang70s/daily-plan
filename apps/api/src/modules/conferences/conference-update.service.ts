import { randomUUID } from 'node:crypto';
import type { Database } from '@research/persistence';
import { submissionConferenceSource } from '@research/persistence';
import type { ConferenceCandidate, ConferenceNodeSource, ConferenceUpdateChoice, ConferenceUpdateItem, ConferenceUpdatePreview, ConferenceUpdateResult, MilestoneDto, MilestoneKind } from '@research/contracts';
import type { SessionContext } from '../identity/identity.service.js';
import { ConferenceSource } from './conference-source.js';
import { SubmissionsService } from '../submissions/submissions.service.js';
import { AppError } from '../../common/app-error.js';
import { writeResource } from '../../common/idempotency.js';
export function nodeSource(candidate: ConferenceCandidate, node: ConferenceCandidate['milestones'][number]): ConferenceNodeSource {
  return { kind: node.kind, due: node.due, sourceTimezone: node.sourceTimezone, sourceUrl: candidate.fileUrl, officialUrl: candidate.officialUrl, verifiedAt: null, rawDeadline: node.rawDeadline };
}
function comparable(node: ConferenceNodeSource, local = false): string {
  const due = node.due?.kind === 'instant' ? { kind: 'instant', at: new Date(node.due.at).toISOString(), timezone: node.due.timezone } : node.due;
  return JSON.stringify([node.kind, due, node.sourceTimezone, node.officialUrl, ...(local ? [node.sourceUrl, node.verifiedAt] : [])]);
}
interface StoredPreview { preview: ConferenceUpdatePreview; candidate: ConferenceCandidate | null; rawYaml: string | null }
export class ConferenceUpdateService {
  constructor(private readonly db: Database, private readonly source: ConferenceSource, private readonly submissions: SubmissionsService, private readonly now: () => number = Date.now) {}
  async preview(ctx: SessionContext, input: { submissionId: string; expectedVersion: number }, key: string): Promise<ConferenceUpdatePreview> {
    const submission = this.submissions.get(ctx, input.submissionId);
    if (submission.archivedAt) throw new AppError(422, 'SUBMISSION_ARCHIVED', '请先恢复投稿，再检查和应用来源更新');
    if (submission.version !== input.expectedVersion) throw new AppError(409, 'VERSION_CONFLICT', '投稿已变化，请刷新后重新检查');
    const imported = submissionConferenceSource(this.db, ctx.userId, submission.id);
    if (!imported) throw new AppError(422, 'CONFERENCE_SOURCE_REQUIRED', '此投稿没有绑定顶会来源，请通过节点编辑手动核对');
    const original = (JSON.parse(String(imported.snapshot_json)) as { candidate: ConferenceCandidate }).candidate;
    const catalog = await this.source.catalog(true);
    const candidate = catalog.items.find(item => item.id === imported.candidate_id) ?? null;
    return writeResource(this.db, ctx.userId, 'conferences:update-preview', key, input, tx => {
      const latest = this.submissions.getInTransaction(tx, ctx, submission.id);
      if (latest.version !== input.expectedVersion) throw new AppError(409, 'VERSION_CONFLICT', '检查期间投稿已变化，请重新检查');
      const bindings = tx.all('SELECT kind,milestone_id,baseline_json FROM conference_milestone_bindings WHERE user_id=? AND submission_id=?', ctx.userId, submission.id);
      const kinds = [...new Set([...original.milestones.map(m => m.kind), ...(candidate?.milestones.map(m => m.kind) ?? []), ...bindings.map(b => b.kind as MilestoneKind)])];
      const items: ConferenceUpdateItem[] = kinds.map(kind => {
        const binding = bindings.find(b => b.kind === kind), old = original.milestones.find(m => m.kind === kind), incoming = candidate?.milestones.find(m => m.kind === kind);
        const baseline: ConferenceNodeSource | null = binding ? JSON.parse(String(binding.baseline_json)) as ConferenceNodeSource : old ? nodeSource(original, old) : null;
        const matches = binding ? latest.milestones.filter(m => m.id === binding.milestone_id) : latest.milestones.filter(m => m.kind === kind);
        const ambiguous = !binding && (matches.length > 1 || !baseline && matches.length > 0);
        const local = !ambiguous && matches.length === 1 ? matches[0]! : null;
        const remote = candidate && incoming ? nodeSource(candidate, incoming) : null;
        let status: ConferenceUpdateItem['status'];
        if (ambiguous) status = 'ambiguous';
        else if (!remote) status = 'upstream_removed';
        else if (!local) status = baseline ? 'local_deleted' : 'added';
        else {
          const localChanged = !!baseline && comparable(local, true) !== comparable(baseline, true), remoteChanged = !baseline || comparable(remote) !== comparable(baseline);
          status = remoteChanged ? localChanged ? 'conflict' : 'changed' : localChanged ? 'local_modified' : 'unchanged';
        }
        const pendingRelativeReminders = local ? Number(tx.get("SELECT count(*) n FROM reminders WHERE user_id=? AND milestone_id=? AND mode='relative' AND status='pending'", ctx.userId, local.id)?.n ?? 0) : 0;
        return { kind, status, baseline, local, localMatches: matches, remote, inferred: !binding && !!baseline, pendingRelativeReminders };
      });
      const preview: ConferenceUpdatePreview = { id: randomUUID(), submissionId: submission.id, submissionName: latest.name, expectedVersion: latest.version, previousSha: String(imported.commit_sha), commitSha: catalog.commitSha, fetchedAt: catalog.fetchedAt, checkedAt: catalog.checkedAt, expiresAt: new Date(this.now() + 30 * 60000).toISOString(), sourceUrl: candidate?.fileUrl ?? null, stale: catalog.stale, issues: candidate ? candidate.issues : ['最新目录中未找到同一会议、年份和轮次，本地节点将保留。'], items };
      const snapshot = this.source.snapshot(catalog.commitSha);
      const stored: StoredPreview = { preview, candidate, rawYaml: candidate ? snapshot?.files.find(f => f.path === candidate.filePath)?.yaml ?? null : null };
      tx.run('DELETE FROM conference_update_proposals WHERE user_id=? AND expires_at<? AND result_json IS NULL', ctx.userId, this.now() - 86400000);
      tx.run('INSERT INTO conference_update_proposals(id,user_id,submission_id,preview_json,created_at,expires_at) VALUES(?,?,?,?,?,?)', preview.id, ctx.userId, submission.id, JSON.stringify(stored), this.now(), Date.parse(preview.expiresAt));
      return preview;
    });
  }
  confirm(ctx: SessionContext, id: string, input: ConferenceUpdateChoice, key: string): ConferenceUpdateResult {
    return writeResource(this.db, ctx.userId, `conferences:update-confirm:${id}`, key, input, tx => {
      const row = tx.get('SELECT * FROM conference_update_proposals WHERE id=? AND user_id=?', id, ctx.userId);
      if (!row) throw new AppError(404, 'CONFERENCE_PREVIEW_NOT_FOUND', '找不到这次来源更新预览');
      const choices = [...input.choices].sort((a, b) => a.kind.localeCompare(b.kind)), decisions = JSON.stringify(choices);
      if (row.result_json) { if (row.decisions_json !== decisions) throw new AppError(409, 'CONFERENCE_ALREADY_CONFIRMED', '此预览已按其他选择确认，请重新检查来源'); return JSON.parse(String(row.result_json)) as ConferenceUpdateResult; }
      if (Number(row.expires_at) <= this.now()) throw new AppError(409, 'CONFERENCE_PREVIEW_EXPIRED', '来源更新预览已过期，请重新检查');
      const { preview, candidate, rawYaml } = JSON.parse(String(row.preview_json)) as StoredPreview;
      const current = this.submissions.getInTransaction(tx, ctx, preview.submissionId);
      if (current.archivedAt || current.version !== preview.expectedVersion) throw new AppError(409, 'VERSION_CONFLICT', '投稿或节点已变化，请保留当前内容并重新检查');
      if (choices.length !== preview.items.length || new Set(choices.map(c => c.kind)).size !== choices.length || choices.some(c => !preview.items.some(i => i.kind === c.kind))) throw new AppError(400, 'CONFERENCE_CHOICES_REQUIRED', '请明确选择每个来源节点保留本地或采用来源');
      const applied = choices.filter(c => c.action === 'use_source');
      if (applied.length && preview.stale) throw new AppError(409, 'CONFERENCE_SOURCE_STALE', '当前只有离线缓存，恢复来源连接并重新检查后才能应用');
      if (applied.length && (!candidate?.importable || !rawYaml)) throw new AppError(422, 'CONFERENCE_NOT_IMPORTABLE', '来源不完整，不能应用截止节点，请手动核实');
      for (const item of preview.items) {
        const choice = choices.find(c => c.kind === item.kind)!;
        if (choice.action === 'use_source' && (!item.remote || item.status === 'ambiguous')) throw new AppError(422, 'CONFERENCE_NODE_UNRESOLVED', '移除或无法唯一匹配的来源节点只能保留本地，请先手动整理');
        let after: MilestoneDto | null = item.local, baseline = item.baseline;
        if (choice.action === 'use_source') {
          const source = item.remote!;
          const fields = { kind: source.kind, due: source.due, sourceTimezone: source.sourceTimezone, sourceUrl: source.sourceUrl, officialUrl: source.officialUrl, verifiedAt: null };
          if (item.local) after = this.submissions.updateMilestoneInTransaction(tx, ctx, item.local.id, { ...fields, expectedVersion: item.local.version, confirmDeadlineChange: true });
          else after = this.submissions.createMilestoneInTransaction(tx, ctx, current.id, { ...fields, expectedSubmissionVersion: this.submissions.getInTransaction(tx, ctx, current.id).version });
          baseline = source;
        }
        if (baseline && item.status !== 'ambiguous') tx.run('INSERT INTO conference_milestone_bindings(user_id,submission_id,kind,milestone_id,baseline_json) VALUES(?,?,?,?,?) ON CONFLICT(user_id,submission_id,kind) DO UPDATE SET milestone_id=excluded.milestone_id,baseline_json=excluded.baseline_json', ctx.userId, current.id, item.kind, after?.id ?? null, JSON.stringify(baseline));
        tx.run('INSERT INTO conference_update_audits(id,proposal_id,user_id,kind,decision,before_json,after_json,created_at) VALUES(?,?,?,?,?,?,?,?)', randomUUID(), id, ctx.userId, item.kind, choice.action, JSON.stringify(item.localMatches), JSON.stringify(choice.action === 'keep_local' ? item.localMatches : after), this.now());
      }
      if (applied.length && candidate) {
        tx.run('INSERT OR IGNORE INTO conference_import_snapshots(user_id,submission_id,commit_sha,snapshot_json,first_seen_at) SELECT user_id,submission_id,commit_sha,snapshot_json,created_at FROM conference_imports WHERE user_id=? AND submission_id=?', ctx.userId, current.id);
        tx.run('INSERT OR IGNORE INTO conference_import_snapshots(user_id,submission_id,commit_sha,snapshot_json,first_seen_at) VALUES(?,?,?,?,?)', ctx.userId, current.id, candidate.commitSha, JSON.stringify({ candidate, rawYaml }), this.now());
        tx.run('UPDATE conference_imports SET commit_sha=?,file_path=?,fetched_at=?,snapshot_json=? WHERE user_id=? AND submission_id=?', candidate.commitSha, candidate.filePath, Date.parse(candidate.fetchedAt), JSON.stringify({ candidate, rawYaml }), ctx.userId, current.id);
      }
      const result: ConferenceUpdateResult = { submission: this.submissions.getInTransaction(tx, ctx, current.id), applied: applied.length, proposalId: id };
      tx.run('UPDATE conference_update_proposals SET decisions_json=?,result_json=? WHERE id=? AND user_id=?', decisions, JSON.stringify(result), id, ctx.userId);
      return result;
    });
  }
}

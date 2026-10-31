import { ConferenceUpdateService, nodeSource } from './conference-update.service.js';
import { conferenceImport } from '@research/persistence';
import type { Database } from '@research/persistence';
import type { CreateConferenceSubmissionInput, ConferenceSubmissionResult, ConferenceUpdateChoice } from '@research/contracts';
import type { SessionContext } from '../identity/identity.service.js';
import { ConferenceSource, parseConferenceSnapshot } from './conference-source.js';
import { SubmissionsService } from '../submissions/submissions.service.js';
import { writeResource } from '../../common/idempotency.js';
import { AppError } from '../../common/app-error.js';
export class ConferenceImportService {
  constructor(private readonly db: Database, private readonly source: ConferenceSource, private readonly submissions: SubmissionsService) {}
  create(ctx: SessionContext, input: CreateConferenceSubmissionInput, key: string): ConferenceSubmissionResult {
    const snapshot = this.source.snapshot(input.commitSha);
    if (!snapshot) throw new AppError(409, 'CONFERENCE_SNAPSHOT_MISSING', '会议目录已变化，请重新加载并选择会议');
    const candidate = parseConferenceSnapshot(snapshot).find(item => item.id === input.candidateId);
    if (!candidate) throw new AppError(404, 'CONFERENCE_NOT_FOUND', '找不到所选顶会记录，请重新选择');
    if (!candidate.importable) throw new AppError(422, 'CONFERENCE_NOT_IMPORTABLE', '来源信息尚不完整，不能自动创建节点', { issues: candidate.issues });
    if (input.submission.name !== candidate.title || input.submission.year !== candidate.year || input.submission.round !== candidate.round) throw new AppError(400, 'CONFERENCE_METADATA_MISMATCH', '请保留所选会议的名称、年份和轮次，或改用手动创建');
    return writeResource(this.db, ctx.userId, 'conferences:create-submission', key, input, tx => {
      const imported = conferenceImport(tx, ctx.userId, candidate.id);
      if (imported) return { submission: this.submissions.getInTransaction(tx, ctx, String(imported.submission_id)), created: false };
      const manual = tx.get("SELECT id FROM submissions WHERE user_id=? AND lower(name)=lower(?) AND year=? AND COALESCE(round,'')=? ORDER BY created_at LIMIT 1", ctx.userId, candidate.title, candidate.year, candidate.round);
      if (manual) return { submission: this.submissions.getInTransaction(tx, ctx, String(manual.id)), created: false };
      const submission = this.submissions.createInTransaction(tx, ctx, input.submission);
      let expectedSubmissionVersion = submission.version;
      for (const milestone of candidate.milestones) {
        const createdNode = this.submissions.createMilestoneInTransaction(tx, ctx, submission.id, { kind: milestone.kind, due: milestone.due, sourceTimezone: milestone.sourceTimezone, sourceUrl: candidate.fileUrl, officialUrl: candidate.officialUrl, verifiedAt: null, expectedSubmissionVersion });
        tx.run('INSERT INTO conference_milestone_bindings(user_id,submission_id,kind,milestone_id,baseline_json) VALUES(?,?,?,?,?)', ctx.userId, submission.id, milestone.kind, createdNode.id, JSON.stringify(nodeSource(candidate, milestone)));
        expectedSubmissionVersion++;
      }
      const rawYaml = snapshot.files.find(file => file.path === candidate.filePath)!.yaml;
      tx.run('INSERT INTO conference_imports(user_id,candidate_id,submission_id,commit_sha,file_path,fetched_at,snapshot_json,created_at) VALUES(?,?,?,?,?,?,?,?)', ctx.userId, candidate.id, submission.id, candidate.commitSha, candidate.filePath, Date.parse(candidate.fetchedAt), JSON.stringify({ candidate, rawYaml }), Date.now());
      tx.run('INSERT INTO conference_import_snapshots(user_id,submission_id,commit_sha,snapshot_json,first_seen_at) VALUES(?,?,?,?,?)', ctx.userId, submission.id, candidate.commitSha, JSON.stringify({ candidate, rawYaml }), Date.now());
      return { submission: this.submissions.getInTransaction(tx, ctx, submission.id), created: true };
    });
  }
  preview(ctx: SessionContext, input: { submissionId: string; expectedVersion: number }, key: string) { return new ConferenceUpdateService(this.db, this.source, this.submissions).preview(ctx, input, key); }
  confirmUpdate(ctx: SessionContext, id: string, input: ConferenceUpdateChoice, key: string) { return new ConferenceUpdateService(this.db, this.source, this.submissions).confirm(ctx, id, input, key); }

}

import type { Database } from '@research/persistence';
import type { AccountExportDto } from '@research/contracts';
import type { SessionContext } from '../identity/identity.service.js';
import { AppError } from '../../common/app-error.js';

// Fixed owner-keyed tables. Never export authentication, push secrets or replay caches.
const tables = {
  projects: 'projects', tasks: 'tasks', scheduleBlocks: 'task_schedule_blocks', events: 'calendar_events',
  preparationTasks: 'event_preparation_tasks', submissions: 'submissions', milestones: 'submission_milestones',
  reminders: 'reminders', notifications: 'notifications', conferenceImports: 'conference_imports',
  conferenceBindings: 'conference_milestone_bindings', conferenceSnapshots: 'conference_import_snapshots',
  conferenceUpdates: 'conference_update_proposals', conferenceAudits: 'conference_update_audits',
  aiExecutions: 'ai_executions', aiAudits: 'ai_action_audits', aiUndos: 'ai_execution_undos',
} as const;
const csvCell = (value: unknown) => {
  let text = String(value ?? '');
  if (/^[\s\uFEFF]*[=+@-]/u.test(text)) text = "'" + text;
  return `"${text.replaceAll('"', '""')}"`;
};
export class ExportService {
  constructor(private readonly db: Database, private readonly now: () => number = Date.now) {}
  json(ctx: SessionContext): AccountExportDto {
    return this.db.withTransaction(tx => {
      const user = tx.get('SELECT u.id,u.created_at,c.username FROM users u JOIN local_credentials c ON c.user_id=u.id WHERE u.id=?', ctx.userId);
      if (!user) throw new AppError(401, 'UNAUTHENTICATED', '账户已失效，请重新登录');
      const data: AccountExportDto['data'] = {};
      for (const [name, table] of Object.entries(tables)) data[name] = tx.all(`SELECT * FROM ${table} WHERE user_id=? ORDER BY rowid`, ctx.userId);
      data.aiUndoAudits = tx.all('SELECT a.* FROM ai_undo_audits a JOIN ai_execution_undos u ON u.run_id=a.run_id WHERE u.user_id=? ORDER BY a.rowid', ctx.userId);
      // Session identities and internal context snapshots are transport details.
      data.aiRuns = tx.all('SELECT id,user_id,request_id,input_text,status,phase,result_json,error_code,error_message,created_at,updated_at,parent_run_id,scope_json,origin,intent FROM ai_runs WHERE user_id=? ORDER BY created_at,id', ctx.userId);
      const preferences = tx.get('SELECT preferences_json FROM user_preferences WHERE user_id=?', ctx.userId);
      return { schemaVersion: 1, exportedAt: new Date(this.now()).toISOString(), account: { id: String(user.id), username: String(user.username), createdAt: new Date(Number(user.created_at)).toISOString() }, preferences: JSON.parse(String(preferences?.preferences_json ?? '{}')) as Record<string, unknown>, data };
    });
  }
  csv(ctx: SessionContext): string {
    const value = this.json(ctx), rows = ['record_type,record_id,data_json'];
    const append = (type: string, id: unknown, data: unknown) => rows.push([type, id, JSON.stringify(data)].map(csvCell).join(','));
    append('metadata', '', { schemaVersion: value.schemaVersion, exportedAt: value.exportedAt });
    append('account', value.account.id, value.account); append('preferences', value.account.id, value.preferences);
    for (const [type, records] of Object.entries(value.data)) for (const row of records) append(type, row.id ?? row.run_id ?? row.submission_id ?? '', row);
    return '\uFEFF' + rows.join('\r\n') + '\r\n';
  }
}

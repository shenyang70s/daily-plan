import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseDocument } from 'yaml';
import { normalizeDeadline } from '@research/domain';
import { conferenceSnapshot, latestConferenceSnapshot, storeConferenceSnapshot } from '@research/persistence';
import type { Database } from '@research/persistence';
import type { ConferenceCandidate, ConferenceCatalog, TaskDue, MilestoneKind } from '@research/contracts';
import { workspaceRoot } from '../../database.service.js';
import { conferenceProfiles } from './conference-profiles.js';
export interface SourceSnapshot { commitSha: string; fetchedAt: string; files: { path: string; yaml: string }[] }
const repository = 'https://github.com/ccfddl/ccf-deadlines';
const object = (value: unknown): Record<string, unknown> => { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid conference source'); return value as Record<string, unknown>; };
const safeUrl = (value: unknown): string | null => { if (typeof value !== 'string') return null; try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; } };
export function parseConferenceSnapshot(snapshot: SourceSnapshot): ConferenceCandidate[] {
  if (!/^[a-f0-9]{40}$/.test(snapshot.commitSha) || !Number.isFinite(Date.parse(snapshot.fetchedAt)) || snapshot.files.length > 64) throw new Error('Invalid snapshot metadata');
  const items: ConferenceCandidate[] = [];
  for (const file of snapshot.files) {
    if (!Object.hasOwn(conferenceProfiles, file.path) || Buffer.byteLength(file.yaml) > 262144) throw new Error('Unsupported source file');
    const document = parseDocument(file.yaml, { uniqueKeys: true, schema: 'core' });
    if (document.errors.length || document.warnings.length) throw new Error('Invalid source YAML');
    const root: unknown = document.toJS({ maxAliasCount: 0 });
    if (!Array.isArray(root) || root.length > 4) throw new Error('Invalid conference document');
    for (const value of root) {
      const entry = object(value), rank = object(entry.rank);
      if (rank.ccf !== 'A') continue;
      if (typeof entry.title !== 'string' || typeof entry.description !== 'string' || typeof entry.sub !== 'string' || !Array.isArray(entry.confs) || entry.confs.length > 64) throw new Error('Invalid conference metadata');
      const years = [...new Set(entry.confs.map(conf => Number(object(conf).year)))].filter(Number.isInteger).sort((a, b) => b - a).slice(0, 2);
      for (const raw of entry.confs) {
        const conf = object(raw), year = Number(conf.year);
        if (!years.includes(year)) continue;
        if (year < 1900 || year > 2200 || typeof conf.id !== 'string' || !Array.isArray(conf.timeline) || conf.timeline.length > 32) throw new Error('Invalid conference edition');
        for (const [index, rawTimeline] of conf.timeline.entries()) {
          const timeline = object(rawTimeline), round = typeof timeline.comment === 'string' && timeline.comment.trim() ? timeline.comment.trim().slice(0, 80) : conf.timeline.length === 1 ? 'main' : `round-${index + 1}`;
          const id = createHash('sha256').update(JSON.stringify([file.path, conf.id, year, round])).digest('hex');
          const issues: string[] = [], milestones: ConferenceCandidate['milestones'] = [];
          const zone = typeof conf.timezone === 'string' && conf.timezone.trim() ? conf.timezone.trim() : null;
          for (const [field, kind] of Object.entries({ abstract_deadline: 'abstract', deadline: 'full_paper', rebuttal_deadline: 'rebuttal', decision_deadline: 'notification' } as const)) {
            const rawDeadline = timeline[field];
            if (rawDeadline === undefined && kind !== 'full_paper') continue;
            let due: TaskDue = null;
            const text = typeof rawDeadline === 'string' ? rawDeadline.trim() : 'TBD';
            if (!['TBD', 'TBA', 'UNKNOWN', ''].includes(text.toUpperCase())) {
              if (/^\d{4}-\d{2}-\d{2}$/.test(text)) { const date = new Date(`${text}T00:00:00Z`); if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== text) issues.push(`${kind}: 日期无效`); else due = { kind: 'date', date: text }; }
              else if (!zone) issues.push(`${kind}: 来源缺少时区，不能导入精确时刻`);
              else {
                try { const normalized = normalizeDeadline({ localDateTime: text.replace(' ', 'T'), timezone: zone }); due = { kind: 'instant', ...normalized }; }
                catch { issues.push(`${kind}: 来源时间或时区无法明确转换`); }
              }
            }
            milestones.push({ kind: kind as MilestoneKind, due, rawDeadline: text, sourceTimezone: zone });
          }
          if (!milestones.length) issues.push('来源没有截止节点');
          const officialUrl = safeUrl(conf.link); if (!officialUrl) issues.push('来源未提供有效官网链接');
          items.push({ id, conferenceId: file.path.split('/').at(-1)!.replace('.yml', ''), title: entry.title, description: entry.description, category: entry.sub, rank: 'A', focuses: conferenceProfiles[file.path]!, year, editionId: conf.id, round, officialUrl, eventDate: typeof conf.date === 'string' ? conf.date : null, place: typeof conf.place === 'string' ? conf.place : null, commitSha: snapshot.commitSha, filePath: file.path, fileUrl: `${repository}/blob/${snapshot.commitSha}/${file.path}`, fetchedAt: snapshot.fetchedAt, milestones, importable: !issues.length, issues });
        }
      }
    }
  }
  if (new Set(items.map(item => item.id)).size !== items.length) throw new Error('Duplicate conference rounds');
  return items;
}
export class ConferenceSource {
  private readonly bundled: SourceSnapshot;
  private current: ConferenceCatalog | null = null;
  private pending: Promise<ConferenceCatalog> | null = null;
  private attemptedAt = 0;
  constructor(private readonly db: Database, private readonly fetcher: typeof fetch = fetch, snapshot?: SourceSnapshot, private readonly now: () => number = Date.now) {
    this.bundled = snapshot ?? JSON.parse(readFileSync(resolve(workspaceRoot, 'apps/api/resources/ccf-deadlines/snapshot.json'), 'utf8')) as SourceSnapshot;
    parseConferenceSnapshot(this.bundled);
  }
  private async read(url: string, max: number, deadline?: AbortSignal): Promise<string> {
    const response = await this.fetcher(url, { signal: deadline ? AbortSignal.any([deadline, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000), redirect: 'error', headers: { 'User-Agent': 'Research-Tasks', Accept: 'application/vnd.github+json' } });
    if (!response.ok || !response.body) throw new Error('CCF source unavailable');
    const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
    try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > max) throw new Error('Source too large'); chunks.push(part.value); } } finally { await reader.cancel(); }
    return Buffer.concat(chunks).toString('utf8');
  }
  snapshot(sha: string): SourceSnapshot | null {
    const stored = conferenceSnapshot(this.db, sha);
    if (stored) return JSON.parse(String(stored.snapshot_json)) as SourceSnapshot;
    return sha === this.bundled.commitSha ? this.bundled : null;
  }
  async catalog(): Promise<ConferenceCatalog> {
    if (this.current && this.now() - this.attemptedAt < (this.current.stale ? 300000 : 21600000)) return this.current;
    if (this.pending) return this.pending;
    this.pending = this.refresh().finally(() => { this.pending = null; }); return this.pending;
  }
  private async refresh(): Promise<ConferenceCatalog> {
    this.attemptedAt = this.now();
    const prior = latestConferenceSnapshot(this.db);
    let snapshot = prior ? JSON.parse(String(prior.snapshot_json)) as SourceSnapshot : this.bundled;
    const deadline = AbortSignal.timeout(12000);
    try {
      if (prior && this.now() - Number(prior.checked_at) < 21600000) return this.current = { items: parseConferenceSnapshot(snapshot), commitSha: snapshot.commitSha, fetchedAt: snapshot.fetchedAt, checkedAt: new Date(Number(prior.checked_at)).toISOString(), stale: false };
      const ref = object(JSON.parse(await this.read('https://api.github.com/repos/ccfddl/ccf-deadlines/git/ref/heads/main', 65536, deadline)));
      const commit = object(ref.object);
      if (typeof commit.sha !== 'string' || !/^[a-f0-9]{40}$/.test(commit.sha)) throw new Error('Invalid commit');
      const cached = this.snapshot(commit.sha);
      if (cached) snapshot = cached;
      else {
        const files: SourceSnapshot['files'] = [], paths = Object.keys(conferenceProfiles);
        for (let offset = 0; offset < paths.length; offset += 4) files.push(...await Promise.all(paths.slice(offset, offset + 4).map(async path => ({ path, yaml: await this.read(`https://raw.githubusercontent.com/ccfddl/ccf-deadlines/${commit.sha}/${path}`, 262144, deadline) }))));
        snapshot = { commitSha: commit.sha, fetchedAt: new Date(this.now()).toISOString(), files };
      }
      const items = parseConferenceSnapshot(snapshot); if (!items.length) throw new Error('Empty source');
      this.db.withTransaction(tx => storeConferenceSnapshot(tx, snapshot.commitSha, JSON.stringify(snapshot), Date.parse(snapshot.fetchedAt), this.now()));
      return this.current = { items, commitSha: snapshot.commitSha, fetchedAt: snapshot.fetchedAt, checkedAt: new Date(this.now()).toISOString(), stale: false };
    } catch {
      return this.current = { items: parseConferenceSnapshot(prior ? JSON.parse(String(prior.snapshot_json)) as SourceSnapshot : this.bundled), commitSha: prior ? String(prior.commit_sha) : this.bundled.commitSha, fetchedAt: prior ? new Date(Number(prior.fetched_at)).toISOString() : this.bundled.fetchedAt, checkedAt: new Date(this.now()).toISOString(), stale: true };
    }
  }
}

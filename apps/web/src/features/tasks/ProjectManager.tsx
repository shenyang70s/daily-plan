import { useState } from 'react';
import type { ProjectDto } from '@research/contracts';
import { Dialog } from '../../components/Dialog';
import { EmptyState } from '../../components/EmptyState';
import { useToast } from '../../components/Toast';
import { tasksText as t } from '../../locales/zh-CN';
import { ApiError } from '../../lib/api-client';
import { useProjects, useResourceWrite, writeApi } from './task-api';
export function ProjectManager({ userId, onClose }: { userId: string; onClose: () => void }) {
  const projects = useProjects(userId), toast = useToast();
  const [name, setName] = useState(''), [editing, setEditing] = useState<ProjectDto | null>(null), [removing, setRemoving] = useState<ProjectDto | null>(null);
  const change = useResourceWrite<{ action: 'create' | 'rename' | 'remove'; id?: string; name?: string; expectedVersion?: number }, ProjectDto | { id: string; deleted: true }>(userId, (input, key) => {
    const path = input.action === 'create' ? '/projects' : `/projects/${input.id}`;
    const body = input.action === 'remove' ? { expectedVersion: input.expectedVersion } : input.action === 'rename' ? { name: input.name, expectedVersion: input.expectedVersion } : { name: input.name };
    return writeApi(path, input.action === 'create' ? 'POST' : input.action === 'rename' ? 'PATCH' : 'DELETE', body, key);
  }, result => { toast('deleted' in result ? t.projectRemoved : editing ? t.projectSaved : t.projectCreated); setName(''); setEditing(null); setRemoving(null); });
  return <Dialog title={t.projectManage} onClose={() => { if (!change.isPending) onClose(); }}>
    <form className="project-form" onSubmit={event => { event.preventDefault(); if (name.trim() && !change.isPending) change.mutate(editing ? { action: 'rename', id: editing.id, expectedVersion: editing.version, name: name.trim() } : { action: 'create', name: name.trim() }); }}>
      <label htmlFor="project-name">{t.projectName}</label><div><input id="project-name" data-autofocus required maxLength={100} value={name} disabled={change.isPending} onChange={event => setName(event.target.value)} /><button className="primary" disabled={!name.trim() || change.isPending}>{editing ? t.projectSave : t.projectCreate}</button></div>
      {editing && <button type="button" disabled={change.isPending} onClick={() => { setEditing(null); setName(''); }}>{t.cancel}</button>}
    </form>
    {change.isError && <p className="error" role="alert">{change.error.message} {change.error instanceof ApiError && change.error.status === 409 && <button type="button" onClick={async () => { await projects.refetch(); setEditing(null); setRemoving(null); setName(''); change.reset(); }}>{t.refresh}</button>}</p>}
    {projects.isPending ? <p role="status">{t.loading}</p> : projects.isError ? <p className="error" role="alert">{t.projectUnavailable} <button type="button" onClick={() => void projects.refetch()}>{t.retry}</button></p> : projects.data.length === 0 ? <EmptyState icon="tasks" title={t.projectEmpty} description={t.projectEmptyHelp} /> : <ul className="project-list">{projects.data.map(project => <li key={project.id}><span>{project.name}</span><div><button type="button" disabled={change.isPending} onClick={() => { change.reset(); setEditing(project); setRemoving(null); setName(project.name); }}>{t.projectRename}</button><button type="button" className="danger" disabled={change.isPending} onClick={() => { change.reset(); setRemoving(project); }}>{t.projectRemove}</button></div>{removing?.id === project.id && <div className="project-confirm"><p>{t.projectRemoveHelp}</p><button type="button" disabled={change.isPending} onClick={() => setRemoving(null)}>{t.cancel}</button><button type="button" className="danger" disabled={change.isPending} onClick={() => change.mutate({ action: 'remove', id: project.id, expectedVersion: project.version })}>{t.confirm}</button></div>}</li>)}</ul>}
  </Dialog>;
}

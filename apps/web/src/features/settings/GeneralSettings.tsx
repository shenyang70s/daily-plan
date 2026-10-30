import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api-client';
import { useToast } from '../../components/Toast';
import { text } from '../../locales/zh-CN';

export interface Preferences { timezone: string; workStart: string; workEnd: string; notify: boolean; quiet: boolean; ai: boolean; proactive: boolean }
interface Props { preferences: Preferences; section?: 'general' | 'notifications' | 'ai'; onSaved: () => void }

export function GeneralSettings({ preferences, section = 'general', onSaved }: Props) {
  const [fields, setFields] = useState(preferences);
  const toast = useToast();
  const save = useMutation({
    mutationFn: () => {
      const patch = section === 'general' ? { timezone: fields.timezone, workStart: fields.workStart, workEnd: fields.workEnd }
        : section === 'notifications' ? { notify: fields.notify, quiet: fields.quiet }
        : { ai: fields.ai, proactive: fields.proactive };
      return apiRequest<Preferences>('/me/preferences', { method: 'PATCH', body: JSON.stringify(patch) });
    },
    onSuccess: value => { setFields(value); onSaved(); toast(text.saved); },
  });
  const zones = [...new Set([preferences.timezone, 'Asia/Shanghai', 'Asia/Tokyo', 'Europe/London', 'America/Los_Angeles', 'Etc/UTC'])];
  return <form className="preferences" onSubmit={event => { event.preventDefault(); if (!save.isPending) save.mutate(); }}>
    <h2>{section === 'general' ? text.settings : text.sectionLabels[section]}</h2>
    {section !== 'general' && <p className="help">{section === 'notifications' ? text.notificationSettingsNote : text.aiSettingsNote}</p>}
    <fieldset disabled={save.isPending}>
      {section === 'general' && <>
        <div className="setting-row"><label htmlFor="timezone">{text.timezone}</label><select id="timezone" value={fields.timezone} onChange={event => setFields({ ...fields, timezone: event.target.value })}>{zones.map(zone => <option key={zone}>{zone}</option>)}</select></div>
        <div className="setting-row"><label htmlFor="workStart">{text.workStart}</label><input id="workStart" type="time" value={fields.workStart} onChange={event => setFields({ ...fields, workStart: event.target.value })} required /></div>
        <div className="setting-row"><label htmlFor="workEnd">{text.workEnd}</label><input id="workEnd" type="time" value={fields.workEnd} onChange={event => setFields({ ...fields, workEnd: event.target.value })} required /></div>
      </>}
      {section === 'notifications' && <>
        <div className="setting-row"><label htmlFor="notifications">{text.notify}</label><input id="notifications" type="checkbox" checked={fields.notify} onChange={event => setFields({ ...fields, notify: event.target.checked })} /></div>
        <div className="setting-row"><label htmlFor="quiet">{text.quiet}</label><input id="quiet" type="checkbox" checked={fields.quiet} onChange={event => setFields({ ...fields, quiet: event.target.checked })} /></div>
      </>}
      {section === 'ai' && <>
        <div className="setting-row"><label htmlFor="ai">{text.ai}</label><input id="ai" type="checkbox" checked={fields.ai} onChange={event => setFields({ ...fields, ai: event.target.checked })} /></div>
        <div className="setting-row"><label htmlFor="proactive">{text.proactive}</label><input id="proactive" type="checkbox" checked={fields.proactive} onChange={event => setFields({ ...fields, proactive: event.target.checked })} /></div>
      </>}
    </fieldset>
    <div className="settings-footer"><p className={save.isError ? 'error' : 'help'} role="status">{save.isError ? save.error.message : save.isSuccess ? text.saved : ''}</p><button className="primary" disabled={save.isPending}>{save.isPending ? text.saving : text.save}</button></div>
  </form>;
}

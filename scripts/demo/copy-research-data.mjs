import { randomUUID } from 'node:crypto';

// Administrative copy: no source rows, sessions, AI history or replay caches are changed.
export function copyResearchExamples(db, sourceUsername, targetUsername, passwordHash, now = Date.now()) {
  const sourceName=sourceUsername.trim().toLowerCase(),targetName=targetUsername.trim().toLowerCase();
  if(!/^[a-z0-9][a-z0-9_.-]{2,31}$/.test(targetName)||sourceName===targetName)throw Error('Invalid target username');
  if(!/^scrypt\$32768\$8\$3\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(passwordHash))throw Error('Invalid encoded password');
  return db.withTransaction(tx=>{
    const source=tx.get('SELECT user_id FROM local_credentials WHERE username=?',sourceName);if(!source)throw Error('Source account not found');
    if(tx.get('SELECT user_id FROM local_credentials WHERE username=?',targetName))throw Error('Target account already exists');
    const dataset=tx.get('SELECT * FROM demo_datasets WHERE user_id=? AND dataset_key=?',source.user_id,'research-observation-v1');if(!dataset)throw Error('Source example manifest not found');
    const manifest=JSON.parse(dataset.manifest_json),targetId=randomUUID(),ids=new Map([[String(source.user_id),targetId]]),deliveryKeys=new Map();
    const owned=table=>tx.all(`SELECT * FROM ${table} WHERE user_id=? ORDER BY rowid`,source.user_id);
    const originalSet=key=>new Set(Object.values(manifest.ids[key]??{}));
    const taskIds=originalSet('tasks'),eventIds=originalSet('events'),submissionIds=originalSet('submissions'),projectIds=originalSet('projects'),notificationIds=originalSet('notifications');
    const tasks=owned('tasks').filter(row=>taskIds.has(row.id));for(const row of tasks)if(row.project_id)projectIds.add(row.project_id);
    const projects=owned('projects').filter(row=>projectIds.has(row.id)),events=owned('calendar_events').filter(row=>eventIds.has(row.id)),submissions=owned('submissions').filter(row=>submissionIds.has(row.id));
    const existingTasks=new Set(tasks.map(row=>row.id)),existingEvents=new Set(events.map(row=>row.id)),existingSubmissions=new Set(submissions.map(row=>row.id));
    const blocks=owned('task_schedule_blocks').filter(row=>existingTasks.has(row.task_id)),preparations=owned('event_preparation_tasks').filter(row=>existingTasks.has(row.task_id)&&existingEvents.has(row.event_id)),milestones=owned('submission_milestones').filter(row=>existingSubmissions.has(row.submission_id)),milestoneIds=new Set(milestones.map(row=>row.id));
    const reminders=owned('reminders').filter(row=>existingTasks.has(row.task_id)||existingEvents.has(row.event_id)||milestoneIds.has(row.milestone_id)),reminderIds=new Set(reminders.map(row=>row.id));
    const hrefs=new Set([...tasks.map(row=>'/tasks/'+row.id),...events.map(row=>'/calendar/events/'+row.id),...submissions.map(row=>'/submissions/'+row.id)]);
    const jobs=owned('outbox_events').filter(row=>reminderIds.has(row.reminder_id)),notifications=owned('notifications').filter(row=>notificationIds.has(row.id)||reminderIds.has(row.reminder_id)||hrefs.has(row.resource_id));
    const groups=[['projects',projects],['tasks',tasks],['calendar_events',events],['task_schedule_blocks',blocks],['event_preparation_tasks',preparations],['submissions',submissions],['submission_milestones',milestones],['reminders',reminders],['outbox_events',jobs],['notifications',notifications]];
    for(const [,rows]of groups)for(const row of rows)if(row.id)ids.set(row.id,randomUUID());
    for(const row of [...jobs,...notifications])if(!deliveryKeys.has(row.delivery_key))deliveryKeys.set(row.delivery_key,'example-copy:'+targetId+':'+randomUUID());
    const replace=value=>{if(typeof value!=='string')return value;for(const [old,next]of [...deliveryKeys,...ids])value=value.replaceAll(old,next);return value;};
    const insert=(table,row)=>{const columns=Object.keys(row);tx.run(`INSERT INTO ${table}(${columns.join(',')}) VALUES(${columns.map(()=>'?').join(',')})`,...Object.values(row));};
    tx.run('INSERT INTO users(id,identity_provider,identity_subject,display_name,created_at) VALUES(?,?,?,?,?)',targetId,'local-password',targetId,targetName,now);
    tx.run('INSERT INTO local_credentials(user_id,username,password_hash,updated_at) VALUES(?,?,?,?)',targetId,targetName,passwordHash,now);
    const preferences=tx.get('SELECT timezone,preferences_json FROM user_preferences WHERE user_id=?',source.user_id);if(!preferences)throw Error('Source preferences missing');
    tx.run('INSERT INTO user_preferences(user_id,timezone,preferences_json,updated_at) VALUES(?,?,?,?)',targetId,preferences.timezone,preferences.preferences_json,now);
    for(const [table,rows]of groups)for(const row of rows){const copy=Object.fromEntries(Object.entries(row).map(([key,value])=>[key,replace(value)]));if(table==='outbox_events'&&copy.status==='running'){copy.status='pending';copy.lease_until=null;}insert(table,copy);}
    for(const table of ['conference_imports','conference_milestone_bindings','conference_import_snapshots'])for(const row of owned(table).filter(row=>existingSubmissions.has(row.submission_id)))insert(table,Object.fromEntries(Object.entries(row).map(([key,value])=>[key,replace(value)])));
    const mappedRecord=value=>Object.fromEntries(Object.entries(value??{}).filter(([,id])=>ids.has(id)).map(([key,id])=>[key,ids.get(id)]));
    const result={...manifest,username:targetName,userId:targetId,copiedFrom:sourceName,copiedAt:new Date(now).toISOString(),alreadySeeded:false,counts:{projects:projects.length,tasks:tasks.length,blocks:blocks.length,events:events.length,submissions:submissions.length,milestones:milestones.length,reminders:reminders.length,notifications:notifications.length},ids:{projects:mappedRecord(manifest.ids.projects),tasks:mappedRecord(manifest.ids.tasks),blocks:blocks.map(row=>ids.get(row.id)),events:mappedRecord(manifest.ids.events),submissions:mappedRecord(manifest.ids.submissions),milestones:mappedRecord(manifest.ids.milestones),reminders:mappedRecord(manifest.ids.reminders),notifications:notifications.map(row=>ids.get(row.id))}};
    tx.run('INSERT INTO demo_datasets(user_id,dataset_key,manifest_json,created_at) VALUES(?,?,?,?)',targetId,dataset.dataset_key,JSON.stringify(result),now);
    if(tx.all('PRAGMA foreign_key_check').length)throw Error('Copy foreign key validation failed');
    return result;
  });
}

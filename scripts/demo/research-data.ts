import { randomUUID } from 'node:crypto';
import type { Database } from '../../packages/persistence/src/database.js';
import { CreateTaskSchema, CreateCalendarEventSchema, CreateSubmissionSchema, CreateMilestoneSchema, CreateReminderSchema } from '../../packages/contracts/src/index.js';
import type { TaskDto, TaskStatus, CalendarItem } from '../../packages/contracts/src/index.js';
import { calendarDateAt, calendarWindow, normalizeDeadline, shiftCalendarDate, suggestSchedule } from '../../packages/domain/src/index.js';
import { IdentityService } from '../../apps/api/dist/modules/identity/identity.service.js';
import { TasksService } from '../../apps/api/dist/modules/tasks/tasks.service.js';
import { CalendarService } from '../../apps/api/dist/modules/calendar/calendar.service.js';
import { SubmissionsService } from '../../apps/api/dist/modules/submissions/submissions.service.js';
import { RemindersService } from '../../apps/api/dist/modules/reminders/reminders.service.js';
const datasetKey = 'research-observation-v1';
const mark = '【模拟】';
interface TaskSpec { key: string; title: string; project: string; type: TaskDto['type']; status: TaskStatus; due: number | null; minutes: number; priority?: 'high' | 'normal' | 'low'; slot?: [number,string]; archived?: boolean; note?: string }
export interface DemoManifest { datasetKey: string; username: string; userId: string; seededAt: string; anchorDate: string; timezone: string; alreadySeeded: boolean; counts: { projects: number; tasks: number; blocks: number; events: number; submissions: number; milestones: number; reminders: number; notifications: number }; ids: { projects: Record<string,string>; tasks: Record<string,string>; blocks: string[]; events: Record<string,string>; submissions: Record<string,string>; milestones: Record<string,string>; reminders: Record<string,string>; notifications: string[] }; skipped: string[] }
export function seedResearchData(db: Database, username: string, now = Date.now()): DemoManifest {
  const account = db.get('SELECT user_id,username FROM local_credentials WHERE username=?', username.trim().toLowerCase());
  if (!account) throw new Error(`用户 ${username} 不存在；模拟数据只写入指定的已有账户。`);
  const userId = String(account.user_id);
  return db.withTransaction(tx => {
    const previous = tx.get('SELECT manifest_json FROM demo_datasets WHERE user_id=? AND dataset_key=?', userId, datasetKey);
    if (previous) return { ...JSON.parse(String(previous.manifest_json)) as DemoManifest, alreadySeeded: true };
    const scoped: Database = { get: tx.get, all: tx.all, withTransaction: callback => callback(tx), ready: () => true, close: () => { throw new Error('Cannot close seed transaction'); } };
    const identity = new IdentityService(scoped, () => now), ctx = { userId, sessionId: 'local-demo-seed', csrfToken: '' }, preferences = identity.getPreferences(ctx);
    const tasks = new TasksService(scoped, identity, () => now), calendar = new CalendarService(scoped, tasks, identity), submissions = new SubmissionsService(scoped, identity, () => now), reminders = new RemindersService(scoped, () => now);
    const timezone = preferences.timezone, today = calendarDateAt(new Date(now).toISOString(), timezone), day = (offset: number) => shiftCalendarDate(today, offset);
    const ids: DemoManifest['ids'] = { projects: {}, tasks: {}, blocks: [], events: {}, submissions: {}, milestones: {}, reminders: {}, notifications: [] }, skipped: string[] = [];
    const key = (label: string) => `${datasetKey}:${label}`;
    const note = (text = '') => `${mark}科研工作流演示数据。任务状态、指标和排期均为模拟，不会启动真实训练或设备评测。\n${text}`;
    for (const [name, title] of Object.entries({ edge: '边缘智能：事件感知与低功耗推理', snn: '脉冲神经网络：训练与时序优化', brain: '类脑计算：神经形态软硬件协同', paper: '研究整合：论文与顶会投稿' })) ids.projects[name] = tasks.createProject(ctx, { name: `【课题】${title}` }, key(`project:${name}`)).id;
    const specs: TaskSpec[] = [
      { key:'edge_reading',title:'精读事件驱动视觉与边缘推理综述',project:'edge',type:'paper_reading',status:'in_progress',due:0,minutes:60,priority:'high',slot:[0,'09:00'] },
      { key:'snn_baseline',title:'复现 SNN 代理梯度训练基线',project:'snn',type:'experiment',status:'in_progress',due:0,minutes:90,priority:'high',slot:[0,'10:30'],note:'记录训练配置、随机种子、时间步数与验证流程；这里只展示规划状态，没有启动GPU任务。' },
      { key:'edge_profile',title:'评测端侧事件分类的时延与内存',project:'edge',type:'experiment',status:'in_progress',due:0,minutes:60,priority:'high',slot:[0,'14:00'],note:'模拟观测值（非实测）：方案A 12.4ms/96MB，方案B 9.8ms/80MB；用于展示实验笔记，不可作为研究结论。' },
      { key:'brain_survey',title:'整理类脑芯片与存算协同调研表',project:'brain',type:'research',status:'todo',due:0,minutes:60,slot:[0,'16:00'] },
      { key:'lif_learning',title:'完成 LIF/ALIF 动力学与离散化笔记',project:'snn',type:'learning',status:'done',due:-1,minutes:60,slot:[-1,'09:00'] },
      { key:'event_pipeline',title:'完成 DVS 事件数据预处理流水线检查',project:'edge',type:'experiment',status:'done',due:-1,minutes:90,slot:[-1,'10:30'] },
      { key:'sparsity_table',title:'补录脉冲稀疏性与能耗对照表',project:'snn',type:'research',status:'done',due:0,minutes:30,slot:[0,'17:30'] },
      { key:'converted_baseline',title:'归纳 ANN→SNN 转换基线配置',project:'snn',type:'learning',status:'done',due:-2,minutes:60,slot:[-2,'14:00'] },
      { key:'overdue_reproduce',title:'补齐 SNN 复现实验环境记录',project:'snn',type:'experiment',status:'todo',due:-1,minutes:45,priority:'high',note:'逾期状态示例：可用AI重新安排工作时段，期限不自动移动。' },
      { key:'overdue_energy',title:'核对边缘设备能耗统计口径',project:'edge',type:'research',status:'in_progress',due:-2,minutes:45,priority:'high' },
      { key:'next_energy',title:'比较脉冲稀疏率对端侧能耗的影响',project:'edge',type:'experiment',status:'todo',due:1,minutes:60,slot:[1,'09:00'] },
      { key:'next_temporal',title:'验证 8/16 时间步的精度与时延权衡',project:'snn',type:'experiment',status:'todo',due:2,minutes:90,slot:[1,'11:00'] },
      { key:'next_stdp',title:'实现 STDP 小规模验证实验',project:'brain',type:'experiment',status:'todo',due:4,minutes:60,slot:[2,'09:00'] },
      { key:'next_compiler',title:'整理神经形态映射与编译约束',project:'brain',type:'research',status:'todo',due:5,minutes:60,slot:[2,'11:00'] },
      { key:'deadline_paper',title:'梳理边缘智能系统论文的贡献点',project:'paper',type:'research',status:'todo',due:7,minutes:90,priority:'high' },
      { key:'submission_outline',title:'起草 SNN 论文实验与消融提纲',project:'paper',type:'research',status:'todo',due:3,minutes:60,priority:'high' },
      { key:'group_figures',title:'汇总 SNN 组会实验对比图',project:'snn',type:'meeting_prep',status:'todo',due:1,minutes:45,slot:[1,'17:00'] },
      { key:'inbox_alif',title:'想法：比较自适应阈值神经元',project:'snn',type:'learning',status:'inbox',due:null,minutes:45 },
      { key:'inbox_encoding',title:'想法：研究事件编码与输入稀疏性',project:'edge',type:'research',status:'inbox',due:null,minutes:60 },
      { key:'inbox_memristor',title:'想法：调研忆阻器与存内计算',project:'brain',type:'paper_reading',status:'inbox',due:null,minutes:45 },
      { key:'inbox_edge_transformer',title:'想法：分析混合 ANN/SNN 端侧部署',project:'edge',type:'research',status:'inbox',due:null,minutes:60 },
      { key:'cancel_full_precision',title:'暂停无稀疏约束的部署实验分支',project:'edge',type:'experiment',status:'canceled',due:2,minutes:60,priority:'low' },
      { key:'archived_pilot',title:'归档首轮事件分类试验清单',project:'edge',type:'experiment',status:'done',due:-7,minutes:60,archived:true },
      { key:'observe_status',title:'观察 SNN 任务状态与提醒链路',project:'snn',type:'experiment',status:'in_progress',due:null,minutes:30,note:'用于观察任务详情、改期、通知与重试。这里的“进行中”是模拟状态，不代表后台训练进程。' },
    ];
    for (const spec of specs) {
      const due = spec.key === 'observe_status' ? { kind:'date',date:day(1) } : spec.due == null ? null : { kind:'date',date:day(spec.due) };
      ids.tasks[spec.key] = tasks.create(ctx, CreateTaskSchema.parse({ title:`${mark}${spec.title}`,type:spec.type,priority:spec.priority ?? 'normal',due,durationMinutes:spec.minutes,projectId:ids.projects[spec.project],note:note(spec.note) }), key(`task:${spec.key}`)).id;
    }
    function freeRange(offset: number, hhmm: string, minutes: number) {
      const date = day(offset), window = calendarWindow(date,'day',timezone), items = calendar.list(ctx,{...window,timezone}).items.filter((i): i is CalendarItem => 'kind' in i);
      const startAt = normalizeDeadline({localDateTime:`${date}T${hhmm}:00`,timezone}).at, candidate = {startAt,endAt:new Date(Date.parse(startAt)+minutes*60000).toISOString(),timezone};
      const workStart=normalizeDeadline({localDateTime:`${date}T${preferences.workStart}`,timezone}).at,workEnd=normalizeDeadline({localDateTime:`${date}T${preferences.workEnd}`,timezone}).at;
      if (Date.parse(candidate.startAt)>=Date.parse(workStart)&&Date.parse(candidate.endAt)<=Date.parse(workEnd)&&!calendar.check(ctx,candidate).conflicts.length) return candidate;
      return suggestSchedule({now:Date.parse(window.from)-60000,timezone,workStart:preferences.workStart,workEnd:preferences.workEnd,durationMinutes:minutes,due:null,items,preferredDate:date});
    }
    for (const event of [
      {key:'sync',offset:0,time:'12:15',minutes:45,title:'类脑计算研究同步',project:'brain'},
      {key:'group',offset:1,time:'18:30',minutes:60,title:'SNN 与边缘智能组会',project:'snn',prep:'确认 SNN 组会议程与实验演示'},
      {key:'review',offset:3,time:'14:00',minutes:45,title:'模拟投稿内部审阅',project:'paper',prep:'整理模拟投稿内部审阅清单'},
      {key:'seminar',offset:5,time:'10:00',minutes:60,title:'边缘推理与神经形态协同研讨',project:'edge'},
    ]) {
      const range = freeRange(event.offset,event.time,event.minutes);
      if (!range) { skipped.push(`事件${event.title}无空档，保留现有日程。`); continue; }
      const record = calendar.createEvent(ctx,CreateCalendarEventSchema.parse({...range,title:`${mark}${event.title}`,location:'模拟研究讨论室',note:note('模拟日程，不对应真实邀请或会议。'),...(event.prep?{preparationTask:CreateTaskSchema.parse({title:`${mark}${event.prep}`,type:'meeting_prep',durationMinutes:30,projectId:ids.projects[event.project],due:{kind:'date',date:day(event.offset)},note:note()})}:{})}),key(`event:${event.key}`));
      ids.events[event.key]=record.id; for (const prep of record.preparationTasks) ids.tasks[`prep_${event.key}`]=prep.id;
    }
    for (const spec of specs.filter(s=>s.slot)) {
      const range = freeRange(spec.slot![0],spec.slot![1],spec.minutes);
      if (!range) { skipped.push(`工作块${spec.title}无空档，任务保持未安排。`); continue; }
      const task = tasks.get(ctx,ids.tasks[spec.key]!); ids.blocks.push(calendar.createBlock(ctx,{...range,taskId:task.id,expectedTaskVersion:task.version},key(`block:${spec.key}`)).id);
    }
    const observeTask=tasks.get(ctx,ids.tasks.observe_status!),window={from:calendarWindow(today,'day',timezone).from,to:calendarWindow(day(6),'day',timezone).to};
    const observeRange=suggestSchedule({now,timezone,workStart:preferences.workStart,workEnd:preferences.workEnd,durationMinutes:30,due:observeTask.due,items:calendar.list(ctx,{...window,timezone}).items.filter((i): i is CalendarItem=>'kind' in i)});
    if(observeRange)ids.blocks.push(calendar.createBlock(ctx,{...observeRange,taskId:observeTask.id,expectedTaskVersion:observeTask.version},key('block:observe')).id);
    else skipped.push('观察任务没有工作时间内空档，保留为未安排任务。');
    for (const spec of specs) {
      let task: TaskDto = tasks.get(ctx,ids.tasks[spec.key]!);
      if(task.status!==spec.status)task=tasks.update(ctx,task.id,{status:spec.status,expectedVersion:task.version},key(`status:${spec.key}`));
      if(spec.archived)tasks.archive(ctx,task.id,{expectedVersion:task.version},key(`archive:${spec.key}`));
    }
    const year=Number(today.slice(0,4))+1;
    for (const publication of [
      {key:'osdi',name:'OSDI｜边缘事件感知与系统优化',stage:'preparing',nodes:[['abstract',7,'AoE'],['full_paper',14,'AoE'],['notification',28,null]]},
      {key:'neurips',name:'NeurIPS｜低时延脉冲神经网络',stage:'internal_review',nodes:[['abstract',4,null],['full_paper',8,null],['notification',25,null]]},
      {key:'asplos',name:'ASPLOS｜类脑软硬件协同设计',stage:'planning',nodes:[['abstract',null,null],['full_paper',28,'America/Los_Angeles'],['camera_ready',null,null]]},
      {key:'icml',name:'ICML｜脉冲学习与泛化分析',stage:'under_review',nodes:[['abstract',-25,null],['full_paper',-18,'AoE'],['rebuttal',3,'AoE'],['notification',12,null]]},
    ]) {
      const submission=submissions.create(ctx,CreateSubmissionSchema.parse({name:`${mark}${publication.name}`,year,round:'模拟研究排期',stage:publication.stage,nextAction:'模拟排期，非真实会议期限；未核实CFP。用于观察阶段、节点、跨时区和提醒。请勿据此真实投稿。'}),key(`submission:${publication.key}`));ids.submissions[publication.key]=submission.id;
      for(const [kind,offset,zone] of publication.nodes) {
        const node=submissions.createMilestone(ctx,submission.id,CreateMilestoneSchema.parse({kind,expectedSubmissionVersion:submissions.get(ctx,submission.id).version,...(offset==null?{due:null}:zone?{localDeadline:{localDateTime:`${day(Number(offset))}T23:59:59`,timezone:zone},sourceTimezone:zone}:{due:{kind:'date',date:day(Number(offset))}}),verifiedAt:null}),key(`milestone:${publication.key}:${kind}`));ids.milestones[`${publication.key}_${kind}`]=node.id;
      }
    }
    function addReminder(name:string,targetType:'task'|'event'|'milestone',targetId:string,policy:Record<string,unknown>,clock=now) {
      const service=clock===now?reminders:new RemindersService(scoped,()=>clock);
      const row=service.create(ctx,CreateReminderSchema.parse({targetType,targetId,timezone,...policy}),key(`reminder:${name}`));ids.reminders[name]=row.id;return row;
    }
    addReminder('observe','task',ids.tasks.observe_status!,{mode:'absolute',at:new Date(now+5*60000).toISOString()});
    addReminder('tomorrow_energy','task',ids.tasks.next_energy!,{mode:'relative',offsetMinutes:60,dateTime:'09:00'});
    addReminder('osdi_full','milestone',ids.milestones.osdi_full_paper!,{mode:'relative',offsetMinutes:1440});
    addReminder('neurips_full','milestone',ids.milestones.neurips_full_paper!,{mode:'relative',offsetMinutes:1440,dateTime:'09:00'});
    if(ids.events.group)addReminder('group','event',ids.events.group,{mode:'relative',offsetMinutes:30});
    const canceled=addReminder('canceled','task',ids.tasks.observe_status!,{mode:'absolute',at:new Date(now+90*60000).toISOString()});reminders.cancel(ctx,canceled.id,{expectedVersion:canceled.version},key('reminder:cancel'));
    const failed=addReminder('failed','task',ids.tasks.observe_status!,{mode:'absolute',at:new Date(now-15*60000).toISOString()},now-3600000);
    tx.run("UPDATE outbox_events SET status='failed',attempts=5,last_error_code='DEMO_SIMULATED_FAILURE',updated_at=? WHERE reminder_id=? AND user_id=?",now-15*60000,failed.id,userId);
    const sent=addReminder('sent','task',ids.tasks.snn_baseline!,{mode:'absolute',at:new Date(now-30*60000).toISOString()},now-3600000);
    tx.run("UPDATE reminders SET status='sent',updated_at=? WHERE id=? AND user_id=?",now-30*60000,sent.id,userId);
    tx.run("UPDATE outbox_events SET status='sent',attempts=1,updated_at=? WHERE reminder_id=? AND user_id=?",now-30*60000,sent.id,userId);
    const deliveryKey=String(tx.get('SELECT delivery_key FROM outbox_events WHERE reminder_id=? AND user_id=?',sent.id,userId)!.delivery_key);
    for (const item of [
      {title:`${mark}SNN 实验核对提醒`,body:'模拟已送达通知：请核对时间步数、时延和能耗记录。此状态为演示，不代表真实训练或外部推送。',href:`/tasks/${ids.tasks.snn_baseline}`,reminder:sent.id,deliveryKey,at:now-30*60000,read:null},
      {title:`${mark}模拟数据已就绪`,body:'边缘智能、SNN、类脑计算的演示课题、任务、日程与投稿已导入。投稿期限全部为模拟排期。',href:'/today',reminder:null,deliveryKey:key(`notification:${userId}:ready`),at:now,read:null},
      {title:`${mark}事件数据流水线检查完成`,body:'模拟已读通知，展示已完成任务与历史记录。',href:`/tasks/${ids.tasks.event_pipeline}`,reminder:null,deliveryKey:key(`notification:${userId}:read`),at:now-3600000,read:now-25*60000},
    ]) {const id=randomUUID();tx.run('INSERT INTO notifications(id,user_id,delivery_key,title,body,resource_type,resource_id,created_at,read_at,reminder_id) VALUES(?,?,?,?,?,?,?,?,?,?)',id,userId,item.deliveryKey,item.title,item.body,'task',item.href,item.at,item.read,item.reminder);ids.notifications.push(id);}
    const manifest: DemoManifest={datasetKey,username:String(account.username),userId,seededAt:new Date(now).toISOString(),anchorDate:today,timezone,alreadySeeded:false,counts:{projects:Object.keys(ids.projects).length,tasks:Object.keys(ids.tasks).length,blocks:ids.blocks.length,events:Object.keys(ids.events).length,submissions:Object.keys(ids.submissions).length,milestones:Object.keys(ids.milestones).length,reminders:Object.keys(ids.reminders).length,notifications:ids.notifications.length},ids,skipped};
    tx.run('INSERT INTO demo_datasets(user_id,dataset_key,manifest_json,created_at) VALUES(?,?,?,?)',userId,datasetKey,JSON.stringify(manifest),now);
    return manifest;
  });
}

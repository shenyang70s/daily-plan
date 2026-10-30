import { z } from 'zod';
export const TaskStatusSchema = z.enum(['inbox','todo','in_progress','done','canceled']);
export const TaskTypeSchema = z.enum(['experiment','paper_reading','learning','research','meeting_prep','personal','other']);
const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{
  const parsed=new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10)===value;
}, 'Invalid calendar date');
export const TaskDueSchema = z.discriminatedUnion('kind',[
  z.object({kind:z.literal('date'),date:localDate}).strict(),
  z.object({kind:z.literal('instant'),at:z.string().datetime({offset:true}),timezone:z.string().min(1)}).strict(),
]).nullable();
export const CreateTaskSchema = z.object({
  title:z.string().trim().min(1).max(200),
  type:TaskTypeSchema.default('other'),
  priority:z.enum(['low','normal','high']).default('normal'),
  due:TaskDueSchema.default(null),
  durationMinutes:z.number().int().min(0).max(1440).nullable().default(null),
  projectId:z.string().uuid().nullable().default(null),
  externalUrl:z.string().url().refine(value=>/^https?:\/\//i.test(value)).nullable().default(null),
  note:z.string().max(10000).default(''),
}).strict();
export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;
export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type TaskDue = z.infer<typeof TaskDueSchema>;
export interface ApiError {code:string;message:string;fieldErrors?:Record<string,string[]>}
export interface CursorPage<T> {items:T[];nextCursor:string|null}
export const LoginSchema=z.object({username:z.string().min(1).max(32),password:z.string().min(1).max(128)}).strict();
export const PreferencesPatchSchema=z.object({timezone:z.string().min(1).max(64),workStart:z.string(),workEnd:z.string(),notify:z.boolean(),quiet:z.boolean(),ai:z.boolean(),proactive:z.boolean()}).partial().strict();

export const ExpectedVersionSchema = z.object({ expectedVersion: z.number().int().min(1) }).strict();
export const UpdateTaskSchema = CreateTaskSchema.partial().extend({
  status: TaskStatusSchema.optional(), expectedVersion: z.number().int().min(1),
}).strict();
export const TaskListSchema = z.object({
  view: z.enum(['all', 'inbox', 'today']).default('all'),
  status: TaskStatusSchema.optional(), type: TaskTypeSchema.optional(),
  priority: z.enum(['low', 'normal', 'high']).optional(),
  projectId: z.string().uuid().optional(), q: z.string().trim().max(200).optional(),
  dueFrom: localDate.optional(), dueTo: localDate.optional(),
  due: z.enum(['today', 'overdue', 'none']).optional(),
  archived: z.enum(['true', 'false']).default('false'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).max(512).optional(),
}).strict().refine(value => !value.dueFrom || !value.dueTo || value.dueFrom <= value.dueTo, 'Invalid date range');
export const CreateProjectSchema = z.object({ name: z.string().trim().min(1).max(100) }).strict();
export const UpdateProjectSchema = CreateProjectSchema.extend({ expectedVersion: z.number().int().min(1) }).strict();
export const ProjectListSchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(100), cursor: z.string().min(1).max(512).optional() }).strict();
export type UpdateTaskInput = z.infer<typeof UpdateTaskSchema>;
export type TaskListInput = z.infer<typeof TaskListSchema>;
export type RescheduleTaskInput = z.infer<typeof RescheduleTaskSchema>;
export interface ScheduleBlockDto { id: string; startAt: string; endAt: string; timezone: string; version: number }
export interface TaskDto {
  id: string; title: string; type: z.infer<typeof TaskTypeSchema>; status: TaskStatus;
  priority: 'low' | 'normal' | 'high'; due: TaskDue; durationMinutes: number | null;
  projectId: string | null; note: string; externalUrl: string | null;
  createdAt: string; updatedAt: string; completedAt: string | null;
  archivedAt: string | null; deletedAt: string | null; version: number;
  scheduleBlocks: ScheduleBlockDto[];
}
export interface ProjectDto { id: string; name: string; version: number; createdAt: string; updatedAt: string }

const calendarInstant = z.string().datetime({ offset: true });
export const CalendarRangeSchema = z.object({ startAt: calendarInstant, endAt: calendarInstant, timezone: z.string().min(1).max(64) }).strict();
export const ConflictConfirmationSchema = z.object({ conflictToken: z.string().regex(/^[a-f0-9]{64}$/).optional() });
export const CalendarQuerySchema = z.object({ from: calendarInstant, to: calendarInstant, timezone: z.string().min(1).max(64).optional(), taskId: z.string().uuid().optional() }).strict().refine(value => Date.parse(value.to) > Date.parse(value.from) && Date.parse(value.to) - Date.parse(value.from) <= 93 * 86400000, 'Invalid calendar range');
export const CreateCalendarEventSchema = CalendarRangeSchema.extend({ title: z.string().trim().min(1).max(200), location: z.string().max(200).default(''), note: z.string().max(10000).default(''), externalUrl: z.string().url().refine(value => /^https?:\/\//i.test(value)).nullable().default(null), preparationTask: CreateTaskSchema.optional(), ...ConflictConfirmationSchema.shape }).strict();
export const UpdateCalendarEventSchema = CreateCalendarEventSchema.omit({ preparationTask: true }).partial().extend({ expectedVersion: z.number().int().min(1) }).strict();
export const CreateScheduleBlockSchema = CalendarRangeSchema.extend({ taskId: z.string().uuid(), expectedTaskVersion: z.number().int().min(1), ...ConflictConfirmationSchema.shape }).strict();
export const UpdateScheduleBlockSchema = CalendarRangeSchema.extend({ expectedVersion: z.number().int().min(1), ...ConflictConfirmationSchema.shape }).strict();
export const CreateScheduledTaskSchema = z.object({ task: CreateTaskSchema, schedule: CalendarRangeSchema, ...ConflictConfirmationSchema.shape }).strict();
export const CheckConflictsSchema = CalendarRangeSchema.extend({ exclude: z.object({ kind: z.enum(['event', 'block']), id: z.string().uuid() }).strict().optional() }).strict();
export type CalendarRange = z.infer<typeof CalendarRangeSchema>;
export type CalendarQuery = z.infer<typeof CalendarQuerySchema>;
export type CreateCalendarEventInput = z.infer<typeof CreateCalendarEventSchema>;
export type UpdateCalendarEventInput = z.infer<typeof UpdateCalendarEventSchema>;
export type CreateScheduleBlockInput = z.infer<typeof CreateScheduleBlockSchema>;
export type UpdateScheduleBlockInput = z.infer<typeof UpdateScheduleBlockSchema>;
export type CreateScheduledTaskInput = z.infer<typeof CreateScheduledTaskSchema>;
export type CalendarConflict = { kind: 'event' | 'block'; id: string; title: string; startAt: string; endAt: string; version: number };
export interface CalendarEventDto extends CalendarRange { id: string; title: string; location: string; note: string; externalUrl: string | null; version: number; preparationTasks: { id: string; title: string }[] }
export interface CalendarBlockDto extends ScheduleBlockDto { taskId: string; title: string; taskVersion: number; status: 'confirmed' | 'canceled' }
export interface CalendarItem { submissionId?: string; milestoneKind?: MilestoneKind; sourceTimezone?: string | null; kind: 'event' | 'block' | 'milestone'; resourceId: string; title: string; timezone: string; startAt?: string; endAt?: string; date?: string; taskId?: string; version: number }

export const RescheduleTaskSchema = ExpectedVersionSchema.extend({ scope: z.enum(['deadline', 'blocks', 'both']), due: TaskDueSchema.optional(), blocks: z.array(CalendarRangeSchema.extend({ id: z.string().uuid(), expectedVersion: z.number().int().min(1) }).strict()).min(1).max(50).optional(), ...ConflictConfirmationSchema.shape }).strict();

export const SubmissionStageSchema = z.enum(['planning', 'preparing', 'internal_review', 'submitted', 'under_review', 'rebuttal', 'decision', 'accepted', 'rejected', 'withdrawn']);
export const MilestoneKindSchema = z.enum(['abstract', 'full_paper', 'rebuttal', 'notification', 'camera_ready', 'other']);
const httpUrl = z.string().trim().url().refine(value => /^https?:\/\//i.test(value)).nullable();
export const CreateSubmissionSchema = z.object({ name: z.string().trim().min(1).max(200), year: z.number().int().min(1900).max(2200).nullable().default(null), round: z.string().trim().max(80).nullable().default(null), stage: SubmissionStageSchema.default('planning'), submissionUrl: httpUrl.default(null), draftUrl: httpUrl.default(null), nextAction: z.string().max(2000).default('') }).strict();
export const UpdateSubmissionSchema = CreateSubmissionSchema.partial().extend({ expectedVersion: z.number().int().min(1) }).strict();
export const SubmissionListSchema = z.object({ q: z.string().trim().max(200).optional(), stage: SubmissionStageSchema.optional(), year: z.coerce.number().int().min(1900).max(2200).optional(), archived: z.enum(['true', 'false']).default('false'), limit: z.coerce.number().int().min(1).max(100).default(30), cursor: z.string().min(1).max(512).optional() }).strict();
const milestoneFields = z.object({ kind: MilestoneKindSchema, due: TaskDueSchema.optional(), localDeadline: z.object({ localDateTime: z.string().min(1).max(40), timezone: z.string().min(1).max(64), offset: z.string().regex(/^[+-]\d{2}:\d{2}$/).optional() }).strict().optional(), sourceTimezone: z.string().trim().min(1).max(64).nullable().optional(), sourceUrl: httpUrl.optional(), officialUrl: httpUrl.optional(), verifiedAt: z.string().datetime({ offset: true }).nullable().optional() });
export const CreateMilestoneSchema = milestoneFields.extend({ expectedSubmissionVersion: z.number().int().min(1) }).strict().refine(value => !(value.due !== undefined && value.localDeadline !== undefined), 'Use one deadline representation');
export const UpdateMilestoneSchema = milestoneFields.partial().extend({ expectedVersion: z.number().int().min(1), confirmDeadlineChange: z.literal(true).optional() }).strict().refine(value => !(value.due !== undefined && value.localDeadline !== undefined), 'Use one deadline representation');
export const DeleteMilestoneSchema = ExpectedVersionSchema.extend({ confirm: z.literal(true) }).strict();
export type SubmissionStage = z.infer<typeof SubmissionStageSchema>;
export type MilestoneKind = z.infer<typeof MilestoneKindSchema>;
export type CreateSubmissionInput = z.infer<typeof CreateSubmissionSchema>;
export type UpdateSubmissionInput = z.infer<typeof UpdateSubmissionSchema>;
export type SubmissionListInput = z.infer<typeof SubmissionListSchema>;
export type CreateMilestoneInput = z.infer<typeof CreateMilestoneSchema>;
export type UpdateMilestoneInput = z.infer<typeof UpdateMilestoneSchema>;
export interface MilestoneDto { id: string; submissionId: string; kind: MilestoneKind; due: TaskDue; sourceTimezone: string | null; sourceUrl: string | null; officialUrl: string | null; verifiedAt: string | null; createdAt: string; updatedAt: string; version: number }
export interface SubmissionDto { conferenceSource: ConferenceProvenance | null; id: string; name: string; year: number | null; round: string | null; stage: SubmissionStage; submissionUrl: string | null; draftUrl: string | null; nextAction: string; archivedAt: string | null; createdAt: string; updatedAt: string; version: number; milestones: MilestoneDto[]; nextMilestone: MilestoneDto | null }

export type ConferenceFocus = 'systems' | 'ai' | 'edge' | 'snn';
export interface ConferenceCandidate {
  id: string; conferenceId: string; title: string; description: string; category: string; rank: 'A'; focuses: ConferenceFocus[];
  year: number; editionId: string; round: string; officialUrl: string | null; eventDate: string | null; place: string | null;
  commitSha: string; filePath: string; fileUrl: string; fetchedAt: string;
  milestones: { kind: MilestoneKind; due: TaskDue; rawDeadline: string; sourceTimezone: string | null }[];
  importable: boolean; issues: string[];
}
export interface ConferenceCatalog { items: ConferenceCandidate[]; commitSha: string; fetchedAt: string; checkedAt: string; stale: boolean }
export interface ConferenceProvenance { candidateId: string; conferenceId: string; title: string; year: number; round: string; commitSha: string; filePath: string; fileUrl: string; fetchedAt: string }
export const ConferenceQuerySchema = z.object({ q: z.string().trim().max(200).optional(), focus: z.enum(['systems', 'ai', 'edge', 'snn']).optional(), year: z.coerce.number().int().min(1900).max(2200).optional() }).strict();
export const CreateConferenceSubmissionSchema = z.object({ candidateId: z.string().regex(/^[a-f0-9]{64}$/), commitSha: z.string().regex(/^[a-f0-9]{40}$/), submission: CreateSubmissionSchema }).strict();
export type CreateConferenceSubmissionInput = z.infer<typeof CreateConferenceSubmissionSchema>;
export interface ConferenceSubmissionResult { submission: SubmissionDto; created: boolean }

export const ReminderTargetSchema = z.object({ targetType: z.enum(['task', 'event', 'milestone']), targetId: z.string().uuid() }).strict();
const reminderTimeFields = {
  mode: z.enum(['absolute', 'relative']), timezone: z.string().min(1).max(64),
  at: z.string().datetime({ offset: true }).optional(), offsetMinutes: z.number().int().min(0).max(525600).optional(),
  dateTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
};
const validReminderTime = (v: { mode: string; at?: string | undefined; offsetMinutes?: number | undefined; dateTime?: string | undefined }) => v.mode === 'absolute' ? !!v.at && v.offsetMinutes === undefined && v.dateTime === undefined : !v.at && v.offsetMinutes !== undefined;
export const CreateReminderSchema = ReminderTargetSchema.extend(reminderTimeFields).strict().refine(validReminderTime, 'Choose an absolute instant or relative deadline policy');
export const UpdateReminderSchema = z.object({ ...reminderTimeFields, expectedVersion: z.number().int().min(1) }).strict().refine(validReminderTime, 'Choose an absolute instant or relative deadline policy');
export const NotificationListSchema = z.object({ cursor: z.string().max(200).optional(), limit: z.coerce.number().int().min(1).max(100).default(30) }).strict();
export const SnoozeNotificationSchema = z.object({ minutes: z.number().int().min(1).max(10080) }).strict();
export type ReminderTarget = z.infer<typeof ReminderTargetSchema>;
export type CreateReminderInput = z.infer<typeof CreateReminderSchema>;
export type UpdateReminderInput = z.infer<typeof UpdateReminderSchema>;
export interface ReminderDto extends ReminderTarget { id: string; mode: 'absolute' | 'relative'; timezone: string; scheduledFor: string; offsetMinutes: number; dateTime: string | null; status: 'pending' | 'sent' | 'canceled'; version: number; deliveryStatus: string | null; lastErrorCode: string | null }
export interface NotificationDto { id: string; title: string; body: string; href: string; createdAt: string; readAt: string | null; snoozedUntil: string | null; reminderId: string | null }
export interface NotificationPage extends CursorPage<NotificationDto> { unreadCount: number }

export const EmptyInputSchema = z.object({}).strict();

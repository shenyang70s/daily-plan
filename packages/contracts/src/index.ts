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
export const RescheduleTaskSchema = ExpectedVersionSchema.extend({
  scope: z.enum(['deadline', 'blocks', 'both']), due: TaskDueSchema,
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

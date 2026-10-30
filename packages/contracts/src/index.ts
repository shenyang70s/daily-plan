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

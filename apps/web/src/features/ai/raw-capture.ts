import { CreateTaskSchema } from '@research/contracts';

// Explicit outage fallback: keep the original request without interpreting it.
export function rawCaptureTask(text: string) {
  const firstLine = text.trim().split(/\r?\n/)[0] ?? '';
  let title = firstLine.slice(0, 200);
  if (/[\uD800-\uDBFF]$/.test(title)) title = title.slice(0, -1);
  return CreateTaskSchema.parse({ title, note: text, due: null, projectId: null, durationMinutes: null });
}

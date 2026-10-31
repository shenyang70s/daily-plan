import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CursorPage, ProjectDto } from '@research/contracts';
import { apiRequest } from '../../lib/api-client';
import { resourceKey } from '../../app/query-client';

export async function writeApi<T>(path: string, method: string, body: unknown, key: string): Promise<T> {
  return apiRequest<T>(path, { method, body: JSON.stringify(body), headers: { 'Idempotency-Key': key } });
}
export function useResourceWrite<TInput, TResult>(userId: string, write: (input: TInput, key: string) => Promise<TResult>, onSaved?: (result: TResult) => void) {
  const client = useQueryClient();
  const attempt = useRef<{ signature: string; key: string } | null>(null);
  return useMutation({
    mutationFn: (input: TInput) => {
      const signature = JSON.stringify(input);
      if (attempt.current?.signature !== signature) attempt.current = { signature, key: crypto.randomUUID() };
      return write(input, attempt.current.key);
    },
    onSuccess: async result => {
      attempt.current = null;
      await Promise.all(['tasks', 'task', 'inboxCount', 'projects', 'calendar', 'calendarEvent', 'calendarBlock', 'submissions', 'submission', 'reminders', 'notifications', 'notificationStatus'].map(resource => client.invalidateQueries({ queryKey: [resource, userId] })));
      onSaved?.(result);
    },
  });
}
export function useProjects(userId: string) {
  return useQuery({
    queryKey: resourceKey('projects', userId),
    queryFn: async ({ signal }) => {
      const items: ProjectDto[] = [];
      let cursor: string | null = null;
      do {
        const page: CursorPage<ProjectDto> = await apiRequest(`/projects?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { signal });
        items.push(...page.items); cursor = page.nextCursor;
      } while (cursor);
      return items;
    },
  });
}

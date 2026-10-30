import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '../lib/api-client';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, error) => !(error instanceof ApiError && [401, 403, 404, 409].includes(error.status)) && count < 1,
    },
  },
});

export const resourceKey = (resource: string, userId: string, filters: Record<string, unknown> = {}) => [resource, userId, filters] as const;

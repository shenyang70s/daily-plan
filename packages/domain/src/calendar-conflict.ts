export interface TimeRange { startAt: number; endAt: number }
export interface ExistingRange extends TimeRange { id: string }

export function findConflicts<T extends ExistingRange>(candidate: TimeRange, existing: readonly T[]): T[] {
  const valid = (range: TimeRange) => Number.isFinite(range.startAt)
    && Number.isFinite(range.endAt) && range.startAt < range.endAt;
  if (!valid(candidate) || existing.some(range => !valid(range))) throw new Error('Invalid time range');
  return existing.filter(range => candidate.startAt < range.endAt && candidate.endAt > range.startAt);
}

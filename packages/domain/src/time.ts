export function parseLocalDate(input: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) throw new Error('Invalid local date');
  const parsed = new Date(`${input}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== input) {
    throw new Error('Invalid local date');
  }
  return input;
}

/** Fixed-offset source deadlines only. Regional zones require the timezone-library adapter. */
export function normalizeFixedDeadline(local: string, sourceTimezone: string): { at: string; timezone: string } {
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(local);
  if (!match) throw new Error('Invalid deadline date');
  const date = parseLocalDate(match[1]!);
  const hour = Number(match[2]), minute = Number(match[3]), second = Number(match[4]);
  if (hour > 23 || minute > 59 || second > 59) throw new Error('Invalid deadline date/time');
  let offset = 0;
  let timezone = sourceTimezone;
  if (sourceTimezone === 'AoE' || sourceTimezone === 'UTC-12' || sourceTimezone === 'Etc/GMT+12') {
    offset = -12 * 60;
    timezone = 'Etc/GMT+12';
  } else if (sourceTimezone === 'UTC' || sourceTimezone === 'Etc/UTC') {
    timezone = 'Etc/UTC';
  } else {
    const zone = /^UTC([+-])(\d{1,2})(?::([0-5]\d))?$/.exec(sourceTimezone);
    if (!zone) throw new Error('Use the regional timezone adapter for non-fixed offsets');
    const hours = Number(zone[2]), minutes = Number(zone[3] || 0);
    if (hours > 14 || (hours === 14 && minutes > 0)) throw new Error('Invalid timezone offset');
    offset = (hours * 60 + minutes) * (zone[1] === '+' ? 1 : -1);
  }
  const localAsUTC = Date.parse(`${date}T${match[2]}:${match[3]}:${match[4]}Z`);
  return { at: new Date(localAsUTC - offset * 60_000).toISOString(), timezone };
}

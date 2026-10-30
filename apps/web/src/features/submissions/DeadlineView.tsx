import { useEffect, useState } from 'react';
import { deadlineCountdown, formatDeadline } from '@research/domain';
import type { MilestoneDto } from '@research/contracts';
import { submissionText as t } from '../../locales/zh-CN';
export function useNow() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  return now;
}
export function DeadlineView({ milestone, timezone, now, compact = false }: { milestone: MilestoneDto; timezone: string; now: number; compact?: boolean }) {
  const countdown = deadlineCountdown(milestone.due, now, timezone);
  let remaining = t.deadlineUnknown;
  if (countdown.state === 'passed') remaining = t.passed;
  else if (countdown.days !== null) remaining = countdown.days === 0 ? t.dueToday : `${countdown.days} ${t.remainingDays}`;
  else if (countdown.seconds !== null) {
    const total = countdown.seconds, days = Math.floor(total / 86400), hours = Math.floor(total % 86400 / 3600), minutes = Math.floor(total % 3600 / 60), seconds = total % 60;
    remaining = `${t.remaining} ${days}${t.dayUnit} ${hours}${t.hourUnit} ${minutes}${t.minuteUnit} ${seconds}${t.secondUnit}`;
  }
  return <div className={`deadline-view${compact ? ' compact' : ''}`}>
    <p className={`deadline-countdown${countdown.state === 'passed' ? ' passed' : ''}`}>{remaining}</p>
    {milestone.due ? <><p className="deadline-local">{!compact && <span>{t.localTime}：</span>}{formatDeadline(milestone.due, timezone)}</p>{milestone.due.kind === 'date' ? !compact && <p className="help">{t.dateMeaning}</p> : <p className="deadline-source"><span>{t.sourceTime}：</span>{formatDeadline(milestone.due, milestone.sourceTimezone ?? milestone.due.timezone)}</p>}</> : !compact && <p className="help">{t.deadlineUnknown}</p>}
  </div>;
}
export function MilestoneSource({ milestone }: { milestone: MilestoneDto }) {
  return <dl className="milestone-source"><dt>{t.sourceUrl}</dt><dd>{milestone.sourceUrl ? <a href={milestone.sourceUrl} target="_blank" rel="noreferrer">{milestone.sourceUrl}</a> : t.noSource}</dd><dt>{t.officialUrl}</dt><dd>{milestone.officialUrl ? <a href={milestone.officialUrl} target="_blank" rel="noreferrer">{milestone.officialUrl}</a> : t.noSource}</dd><dt>{t.sourceTimezone}</dt><dd>{milestone.sourceTimezone ?? t.unknown}</dd><dt>{t.verifiedAt}</dt><dd>{milestone.verifiedAt ?? t.notVerified}</dd></dl>;
}

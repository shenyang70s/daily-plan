import { formatDeadline } from '@research/domain';
import type { AiInterpretResult } from '@research/contracts';
import { Link } from '../../app/router';
import { aiText as t } from '../../locales/zh-CN';
export function AIResult({ result, onClose }: { result: AiInterpretResult; onClose: () => void }) {
  if (result.kind === 'plan') return null;
  if (result.kind === 'clarification') return <div className="ai-result" role="status"><h3>{t.clarification}</h3><p>{result.question}</p><p className="help">{t.clarificationHelp}</p></div>;
  if (result.kind === 'proposal') return <div className="ai-result ai-draft"><h3>{t.draft}</h3><p className="ai-readonly-note">{t.draftHelp}</p><dl><dt>{t.title}</dt><dd>{result.draft.title}</dd><dt>{t.due}</dt><dd>{result.draft.due ? result.draft.due.kind === 'date' ? `${result.draft.due.date} · ${t.dateOnly}` : formatDeadline(result.draft.due, result.draft.due.timezone) : t.noDue}</dd><dt>{t.note}</dt><dd>{result.draft.note || '—'}</dd></dl>{result.assumptions.length > 0 && <ul>{result.assumptions.map((item, index) => <li key={index}>{item}</li>)}</ul>}<Link href="/tasks" onClick={onClose}>{t.manual} →</Link></div>;
  return <div className="ai-result"><div className="ai-result-heading"><h3>{t.resources[result.resource]}</h3><span>{result.items.length} {t.items}</span></div><p className="help">{t.actualData} · {new Date(result.asOf).toLocaleString('zh-CN')}</p>{!result.items.length && <p>{t.empty}</p>}<ul className="ai-query-results">{result.items.map(item => <li key={item.id}><Link href={item.href} onClick={onClose}>{item.title}<span>→</span></Link><p>{item.detail}</p></li>)}</ul>{result.truncated && <p className="help">{t.truncated}</p>}</div>;
}

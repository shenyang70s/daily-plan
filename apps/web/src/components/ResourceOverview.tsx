import type { ReactNode } from 'react';

export function ResourceOverview({ fields }: { fields: [string, ReactNode][] }) {
  return <dl className="resource-overview">{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? '未设置'}</dd></div>)}</dl>;
}

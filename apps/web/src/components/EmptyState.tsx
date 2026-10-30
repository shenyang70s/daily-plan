import type { ReactNode } from 'react';
import { Icon } from './Icon';
import type { IconName } from './Icon';

export function EmptyState({ title, description, icon = 'tasks', children }: { title: string; description: string; icon?: IconName; children?: ReactNode }) {
  return <div className="empty-state">
    <div className="empty-icon"><Icon name={icon} /></div>
    <h2>{title}</h2><p>{description}</p>{children}
  </div>;
}

import { useEffect, useId, useState } from 'react';
import type { AiScope } from './entry';
import { openAi } from './entry';
import { Icon } from '../../components/Icon';
export function AiEntry({ placeholder, scope }: { placeholder: string; scope?: AiScope | undefined }) {
  const [text, setText] = useState(''), inputId = useId();
  useEffect(() => { const clear = () => setText(''); window.addEventListener('research:task-created', clear); return () => window.removeEventListener('research:task-created', clear); }, []);
  return <form className="ai-page-entry" onSubmit={event => { event.preventDefault(); if (text.trim()) openAi(text.trim(), scope); }}><Icon name="spark" /><label className="sr-only" htmlFor={inputId}>告诉 AI 你想做什么</label><input id={inputId} maxLength={2000} value={text} onChange={event => setText(event.target.value)} placeholder={placeholder} /><button type="submit" className="primary" disabled={!text.trim()}>交给 AI</button></form>;
}

export type AiScope = { type: 'task' | 'event' | 'block' | 'submission' | 'project' | 'milestone' | 'reminder'; id: string };
export function openAi(input = '', scope?: AiScope, autoSubmit = !!input.trim()) { window.dispatchEvent(new CustomEvent('research:open-ai', { detail: { input, scope, autoSubmit } })); }

export type AiScope = { type: 'task' | 'event' | 'block' | 'submission' | 'project'; id: string };
export function openAi(input = '', scope?: AiScope) { window.dispatchEvent(new CustomEvent('research:open-ai', { detail: { input, scope } })); }

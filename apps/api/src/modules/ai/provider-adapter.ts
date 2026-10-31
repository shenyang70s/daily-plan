import type { InterpretContext } from './context-builder.js';
import { interpretationPrompt, capturePrompt, planningPrompt, deletionPrompt } from './context-builder.js';
import { AppError } from '../../common/app-error.js';
export interface ModelProvider { readonly configured: boolean; readonly model: string; interpret(input: InterpretContext, signal: AbortSignal): Promise<unknown> }
export class DeepSeekProvider implements ModelProvider {
  readonly configured: boolean;
  constructor(private readonly key = process.env.DEEPSEEK_API_KEY?.trim() || '', readonly model = process.env.AI_MODEL?.trim() || 'deepseek-flash', private readonly fetcher: typeof fetch = fetch, private readonly timeoutMs = 30000) { this.configured = !!key && (!process.env.AI_PROVIDER?.trim() || process.env.AI_PROVIDER === 'deepseek'); }
  async interpret(input: InterpretContext, signal: AbortSignal): Promise<unknown> {
    if (!this.configured) throw new AppError(503, 'AI_NOT_CONFIGURED', 'DeepSeek 尚未配置，请设置服务端 DEEPSEEK_API_KEY');
    const timeout = AbortSignal.timeout(this.timeoutMs), combined = AbortSignal.any([signal, timeout]);
    try {
      const response = await this.fetcher('https://api.deepseek.com/chat/completions', { method: 'POST', redirect: 'error', signal: combined, headers: { Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: this.model, messages: [{ role: 'system', content: interpretationPrompt + (input.intent === 'capture' ? `\n${capturePrompt}` : '') + planningPrompt + deletionPrompt }, { role: 'user', content: JSON.stringify(input) }], thinking: { type: 'disabled' }, response_format: { type: 'json_object' }, max_tokens: 4000, stream: false }) });
      if (!response.ok) { await response.body?.cancel(); throw new AppError(502, 'AI_PROVIDER_UNAVAILABLE', 'DeepSeek 请求失败，请稍后重试；普通任务功能仍可使用'); }
      if (!response.body) throw new AppError(502, 'AI_INVALID_OUTPUT', '模型未返回有效的结构化内容');
      const reader = response.body.getReader(); const parts: Uint8Array[] = []; let size = 0;
      try { for (;;) { const next = await reader.read(); if (next.done) break; size += next.value.byteLength; if (size > 65536) throw new AppError(502, 'AI_INVALID_OUTPUT', '模型返回内容过长'); parts.push(next.value); } } finally { await reader.cancel().catch(() => {}); }
      const envelope = JSON.parse(Buffer.concat(parts).toString('utf8')) as { choices?: { finish_reason?: string; message?: { content?: string; refusal?: unknown; tool_calls?: unknown } }[] };
      const choice = envelope.choices?.[0], content = choice?.message?.content;
      if (choice?.finish_reason !== 'stop' || !content?.trim() || choice.message?.refusal || choice.message?.tool_calls) throw new AppError(502, 'AI_INVALID_OUTPUT', '模型输出不完整或无法解析，请补充描述后重试');
      return JSON.parse(content);
    } catch (error) {
      if (signal.aborted) throw new AppError(409, 'AI_CANCELED', '已停止本次解析');
      if (timeout.aborted) throw new AppError(504, 'AI_TIMEOUT', 'DeepSeek 响应超时，输入已保留，可重试');
      if (error instanceof AppError) throw error;
      if (error instanceof SyntaxError) throw new AppError(502, 'AI_INVALID_OUTPUT', '模型未返回有效 JSON，请重试');
      throw new AppError(502, 'AI_PROVIDER_UNAVAILABLE', '暂时无法连接 DeepSeek，输入已保留');
    }
  }
}

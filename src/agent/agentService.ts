/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import { AgentContext, buildTools } from './agentTools';

export interface AgentSettings {
    baseUrl: string;
    apiKey: string;
    model: string;
}

const MAX_RESULT_CHARS = 4000;
const MAX_RETRIES = 3;

function truncate(s: string, n: number): string {
    if (s.length <= n) { return s; }
    return `${s.slice(0, n)}\n...[truncated ${s.length - n} chars]`;
}

async function callLlm(settings: AgentSettings, messages: any[], toolDefs: any[]): Promise<any> {
    const _fetch: any = (globalThis as any).fetch;
    const url = `${settings.baseUrl.replace(/\/+$/, '')}/chat/completions`;
    let lastErr: any = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            const resp = await _fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.apiKey}` },
                body: JSON.stringify({ model: settings.model, messages, tools: toolDefs, tool_choice: 'auto' })
            });
            if (!resp.ok) {
                const text = await resp.text();
                // retry on 5xx
                if (resp.status >= 500 && attempt < MAX_RETRIES - 1) {
                    await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
                    lastErr = new Error(`LLM ${resp.status}: ${text}`);
                    continue;
                }
                throw new Error(`LLM ${resp.status}: ${text}`);
            }
            return await resp.json();
        } catch (e) {
            lastErr = e;
            if (attempt < MAX_RETRIES - 1) {
                await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
                continue;
            }
        }
    }
    throw lastErr;
}

export async function runAgent(goal: string, ctx: AgentContext, settings: AgentSettings, maxSteps = 12): Promise<void> {
    const tools = buildTools();
    const toolDefs = tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
    const messages: any[] = [
        { role: 'system', content: 'You are an agentic assistant for an Overleaf LaTeX project. You can read, write, search, create/delete/rename files, compile, and chat. Plan briefly, use tools to accomplish the goal, verify by reading/compiling, then summarize. Be concise.' },
        { role: 'user', content: goal }
    ];
    const output = ctx.output;
    output.appendLine(`[agent] goal: ${goal}`);
    for (let step = 0; step < maxSteps; step++) {
        output.appendLine(`[agent] step ${step + 1}`);
        let data: any;
        try {
            data = await callLlm(settings, messages, toolDefs);
        } catch (e: any) {
            output.appendLine(`[agent] LLM call failed: ${e?.message ?? e}`);
            return;
        }
        const choice = data.choices?.[0];
        const msg = choice?.message;
        if (!msg) {
            output.appendLine('[agent] no message returned');
            return;
        }
        messages.push(msg);
        if (msg.content) { output.appendLine(`[assistant] ${msg.content}`); }
        const toolCalls = msg.tool_calls || [];
        if (toolCalls.length === 0) {
            output.appendLine('[agent] done');
            return;
        }
        for (const tc of toolCalls) {
            const name = tc.function?.name;
            let args: any = {};
            try { args = JSON.parse(tc.function?.arguments || '{}'); } catch { args = {}; }
            const tool = tools.find(t => t.name === name);
            output.appendLine(`[tool] ${name} ${JSON.stringify(args)}`);
            let result = '';
            try {
                const handlerPromise = tool ? tool.handler(args, ctx) : Promise.resolve(`Unknown tool ${name}`);
                const timeoutPromise = new Promise<string>((_resolve, reject) => {
                    setTimeout(() => reject(new Error('Tool timed out after 30s')), 30000);
                });
                result = await Promise.race([handlerPromise, timeoutPromise]);
            } catch (e: any) {
                result = `Error: ${e?.message ?? e}`;
            }
            result = truncate(String(result), MAX_RESULT_CHARS);
            output.appendLine(`[result] ${result.slice(0, 500)}${result.length > 500 ? '...' : ''}`);
            messages.push({ role: 'tool', tool_call_id: tc.id, content: result });
        }
    }
    output.appendLine('[agent] max steps reached');
}

/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import { VirtualFileSystem } from '../core/remoteFileSystemProvider';

export interface AgentContext {
    vfs: VirtualFileSystem | null;
    output: vscode.OutputChannel;
}

export interface AgentTool {
    name: string;
    description: string;
    parameters: any;
    handler: (args: any, ctx: AgentContext) => Promise<string>;
}

function normalizePath(p: string): string {
    return (p || '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/');
}

function uriFor(vfs: VirtualFileSystem, p: string): vscode.Uri {
    const rel = normalizePath(p);
    const base = vfs.origin.path.endsWith('/') ? vfs.origin.path.slice(0, -1) : vfs.origin.path;
    const full = rel ? `${base}/${rel}` : base;
    const uri = vfs.origin.with({ path: full });
    // path-traversal guard
    if (!uri.path.startsWith(base)) {
        throw new Error('Path traversal not allowed');
    }
    return uri;
}

async function walkFiles(vfs: VirtualFileSystem, dirUri: vscode.Uri, prefix: string, acc: string[]): Promise<void> {
    let entries: [string, vscode.FileType][];
    try {
        entries = await vfs.list(dirUri);
    } catch {
        return;
    }
    for (const [name, type] of entries) {
        const rel = prefix ? `${prefix}/${name}` : name;
        if (type === vscode.FileType.Directory) {
            await walkFiles(vfs, uriFor(vfs, rel), rel, acc);
        } else {
            acc.push(rel);
        }
    }
}

export function buildTools(): AgentTool[] {
    return [
        {
            name: 'project_info',
            description: 'Get the current Overleaf project name, id and server.',
            parameters: { type: 'object', properties: {}, required: [] },
            handler: async (_args, ctx) => {
                const vfs = ctx.vfs;
                if (!vfs) { return 'No active project.'; }
                return JSON.stringify({ name: vfs.projectName, id: vfs.projectId, server: vfs.serverName });
            }
        },
        {
            name: 'list_files',
            description: 'List files and folders in a project directory. path defaults to root.',
            parameters: { type: 'object', properties: { path: { type: 'string' } }, required: [] },
            handler: async (args, ctx) => {
                const vfs = ctx.vfs;
                if (!vfs) { return 'No active project.'; }
                const uri = uriFor(vfs, args?.path || '');
                const entries = await vfs.list(uri);
                return entries.map(([n, t]) => `${n}${t === vscode.FileType.Directory ? '/' : ''}`).join('\n') || '(empty)';
            }
        },
        {
            name: 'read_file',
            description: 'Read a text file from the project.',
            parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
            handler: async (args, ctx) => {
                const vfs = ctx.vfs;
                if (!vfs) { return 'No active project.'; }
                if (!args?.path || typeof args.path !== 'string') { return 'Error: path is required.'; }
                const uri = uriFor(vfs, args.path);
                const data = await vfs.openFile(uri);
                return new TextDecoder().decode(data);
            }
        },
        {
            name: 'write_file',
            description: 'Create or overwrite a text file in the project.',
            parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] },
            handler: async (args, ctx) => {
                const vfs = ctx.vfs;
                if (!vfs) { return 'No active project.'; }
                if (!args?.path || typeof args.path !== 'string') { return 'Error: path is required.'; }
                if (typeof args.content !== 'string') { return 'Error: content is required.'; }
                const uri = uriFor(vfs, args.path);
                const bytes = new TextEncoder().encode(args.content);
                await vfs.writeFile(uri, bytes, true, true);
                return `Wrote ${normalizePath(args.path)}`;
            }
        },
        {
            name: 'create_directory',
            description: 'Create a folder in the project.',
            parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
            handler: async (args, ctx) => {
                const vfs = ctx.vfs;
                if (!vfs) { return 'No active project.'; }
                if (!args?.path || typeof args.path !== 'string') { return 'Error: path is required.'; }
                const uri = uriFor(vfs, args.path);
                await vfs.mkdir(uri);
                return `Created directory ${normalizePath(args.path)}`;
            }
        },
        {
            name: 'delete_file',
            description: 'Delete a file or folder from the project.',
            parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
            handler: async (args, ctx) => {
                const vfs = ctx.vfs;
                if (!vfs) { return 'No active project.'; }
                if (!args?.path || typeof args.path !== 'string') { return 'Error: path is required.'; }
                const uri = uriFor(vfs, args.path);
                await vfs.remove(uri, true);
                return `Deleted ${normalizePath(args.path)}`;
            }
        },
        {
            name: 'rename_file',
            description: 'Rename or move a file/folder within the project.',
            parameters: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } }, required: ['from', 'to'] },
            handler: async (args, ctx) => {
                const vfs = ctx.vfs;
                if (!vfs) { return 'No active project.'; }
                if (!args?.from || !args?.to) { return 'Error: from and to are required.'; }
                const oldUri = uriFor(vfs, args.from);
                const newUri = uriFor(vfs, args.to);
                await vfs.rename(oldUri, newUri, true);
                return `Renamed ${normalizePath(args.from)} -> ${normalizePath(args.to)}`;
            }
        },
        {
            name: 'search_files',
            description: 'Search for a text query across all project files. Returns matching file paths and lines.',
            parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
            handler: async (args, ctx) => {
                const vfs = ctx.vfs;
                if (!vfs) { return 'No active project.'; }
                if (!args?.query || typeof args.query !== 'string') { return 'Error: query is required.'; }
                const files: string[] = [];
                await walkFiles(vfs, vfs.origin, '', files);
                const q = String(args.query).toLowerCase();
                const results: string[] = [];
                for (const f of files) {
                    try {
                        const data = await vfs.openFile(uriFor(vfs, f));
                        const text = new TextDecoder().decode(data);
                        const lines = text.split('\n');
                        lines.forEach((line, i) => {
                            if (line.toLowerCase().includes(q)) {
                                results.push(`${f}:${i + 1}: ${line.trim().slice(0, 200)}`);
                            }
                        });
                    } catch {
                        // skip binary/unreadable
                    }
                }
                return results.slice(0, 100).join('\n') || 'No matches.';
            }
        },
        {
            name: 'compile',
            description: 'Compile the project and return the result.',
            parameters: { type: 'object', properties: {}, required: [] },
            handler: async (_args, ctx) => {
                const vfs = ctx.vfs;
                if (!vfs) { return 'No active project.'; }
                const res = await vfs.compile(false, false, false);
                return JSON.stringify(res);
            }
        },
        {
            name: 'get_messages',
            description: 'Get recent collaborator chat messages.',
            parameters: { type: 'object', properties: {}, required: [] },
            handler: async (_args, ctx) => {
                const vfs = ctx.vfs;
                if (!vfs) { return 'No active project.'; }
                const res = await vfs.getMessages();
                return JSON.stringify(res);
            }
        },
        {
            name: 'send_message',
            description: 'Send a chat message to collaborators.',
            parameters: { type: 'object', properties: { content: { type: 'string' } }, required: ['content'] },
            handler: async (args, ctx) => {
                const vfs = ctx.vfs;
                if (!vfs) { return 'No active project.'; }
                if (!args?.content || typeof args.content !== 'string') { return 'Error: content is required.'; }
                const publicId = vfs.getPublicId();
                if (!publicId) { return 'No client identity available.'; }
                const res = await vfs.sendMessage(publicId, args.content);
                return JSON.stringify(res);
            }
        },
    ];
}

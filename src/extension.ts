import * as vscode from 'vscode';
import { ROOT_NAME, ELEGANT_NAME } from './consts';

import { RemoteFileSystemProvider, VirtualFileSystem } from './core/remoteFileSystemProvider';
import { ProjectManagerProvider } from './core/projectManagerProvider';
import { PdfViewEditorProvider } from './core/pdfViewEditorProvider';
import { CompileManager } from './compile/compileManager';
import { LangIntellisenseProvider } from './intellisense';
import { LocalReplicaSCMProvider } from './scm/localReplicaSCM';

import { runAgent } from './agent/agentService';

export function activate(context: vscode.ExtensionContext) {
    // Register: [agent] output channel
    const agentOutput = vscode.window.createOutputChannel('Overleaf Agent');
    context.subscriptions.push(agentOutput);

    // Register: [agent] run command
    context.subscriptions.push(vscode.commands.registerCommand('overleaf-workshop.agent.run', async () => {
        const cfg = vscode.workspace.getConfiguration('overleaf-workshop.agent');
        const baseUrl = cfg.get<string>('baseUrl', 'https://api.openai.com/v1');
        const apiKey = cfg.get<string>('apiKey', '');
        const model = cfg.get<string>('model', 'gpt-4o-mini');
        if (!apiKey) {
            vscode.window.showErrorMessage('Set overleaf-workshop.agent.apiKey in settings first.');
            return;
        }
        const goal = await vscode.window.showInputBox({ prompt: 'Agent goal', placeHolder: 'e.g. Add a section summarizing results and compile' });
        if (!goal) { return; }

        // resolve active VFS
        let vfs: any = null;
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document.uri.scheme === ROOT_NAME) {
            try {
                vfs = await (vscode.commands.executeCommand('remoteFileSystem.prefetch', editor.document.uri)) as any;
                if (vfs && typeof vfs.init === 'function') { await vfs.init(); }
            } catch (e) { /* ignore */ }
        }
        if (!vfs) {
            const uriStr = await vscode.window.showInputBox({ prompt: 'Project URI (overleaf-workshop://...)', placeHolder: 'overleaf-workshop://server/project?user=...&project=...' });
            if (uriStr) {
                try {
                    const uri = vscode.Uri.parse(uriStr);
                    vfs = await (vscode.commands.executeCommand('remoteFileSystem.prefetch', uri)) as any;
                    if (vfs && typeof vfs.init === 'function') { await vfs.init(); }
                } catch (e: any) {
                    vscode.window.showErrorMessage(`Failed to load project: ${e?.message ?? e}`);
                    return;
                }
            }
        }

        agentOutput.show(true);
        vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Overleaf Agent running...', cancellable: false }, async () => {
            await runAgent(goal, { vfs, output: agentOutput }, { baseUrl, apiKey, model });
        });
    }));
    const remoteFileSystemProvider = new RemoteFileSystemProvider(context);
    context.subscriptions.push( ...remoteFileSystemProvider.triggers );

    // Register: [core] ProjectManagerProvider on Activitybar
    const projectManagerProvider = new ProjectManagerProvider(context);
    context.subscriptions.push( ...projectManagerProvider.triggers );

    // Register: [core] PdfViewEditorProvider
    const pdfViewEditorProvider = new PdfViewEditorProvider(context);
    context.subscriptions.push( ...pdfViewEditorProvider.triggers );

    // Register: [compile] CompileManager on Statusbar
    const compileManager = new CompileManager(remoteFileSystemProvider);
    context.subscriptions.push( ...compileManager.triggers );

    // Register: [intellisense] LangIntellisenseProvider
    const langIntellisenseProvider = new LangIntellisenseProvider(context, remoteFileSystemProvider);
    context.subscriptions.push( ...langIntellisenseProvider.triggers );

    // activate vfs for local replica
    LocalReplicaSCMProvider.readSettings()
    .then(async setting => {
        if (setting?.uri) {
            const uri = vscode.Uri.parse(setting.uri);
            if (uri.scheme===ROOT_NAME) {
                // activate vfs
                const vfs = (await (await vscode.commands.executeCommand('remoteFileSystem.prefetch', uri))) as VirtualFileSystem;
                await vfs.init();
                vscode.commands.executeCommand('setContext', `${ROOT_NAME}.activate`, true);
                // activate compile & preview
                if (setting?.enableCompileNPreview) {
                    vscode.commands.executeCommand('setContext', `${ROOT_NAME}.activateCompile`, true);
                }
            }
        }
    });
}

export function deactivate() {
    vscode.commands.executeCommand('setContext', `${ROOT_NAME}.activate`, false);
    vscode.commands.executeCommand('setContext', `${ROOT_NAME}.activateCompile`, false);
}
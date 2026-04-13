import * as vscode from 'vscode';
import * as path from 'path';
import { generatePDF, getAllCodeFiles } from './pdfGenerator';

export function activate(context: vscode.ExtensionContext) {

    const provider = new CodePDFExporterViewProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('codepdf-exporter.settingsView', provider)
    );

    const disposable = vscode.commands.registerCommand('codepdf-exporter.printToPDF', async () => {
        await vscode.commands.executeCommand('workbench.view.extension.codepdf-exporter-sidebar');
    });

    context.subscriptions.push(disposable);
}

class CodePDFExporterViewProvider implements vscode.WebviewViewProvider {

    constructor(private readonly _extensionUri: vscode.Uri) { }

    resolveWebviewView(webviewView: vscode.WebviewView) {
        webviewView.webview.options = { enableScripts: true };
        webviewView.webview.html = this.getWebviewContent();

        webviewView.webview.onDidReceiveMessage(async (message) => {

            if (message.command === 'loadFiles') {
                const workspaceFolders = vscode.workspace.workspaceFolders;
                if (!workspaceFolders) {
                    webviewView.webview.postMessage({ command: 'showFiles', files: [], rootPath: '' });
                    return;
                }
                const rootPath = workspaceFolders[0].uri.fsPath;
                const files = getAllCodeFiles(rootPath);
                const relativeFiles = files.map(f =>
                    path.relative(rootPath, f).replace(/\\/g, '/')
                );
                webviewView.webview.postMessage({
                    command: 'showFiles',
                    files: relativeFiles,
                    rootPath: rootPath
                });
            }

            if (message.command === 'generate') {
                const { font, size, mode, selectedFiles, rootPath, newPagePerFile, showLineNumbers } = message;

                const workspaceFolders = vscode.workspace.workspaceFolders;
                if (!workspaceFolders) {
                    vscode.window.showErrorMessage('No workspace folder open!');
                    return;
                }

                const root = rootPath || workspaceFolders[0].uri.fsPath;
                let filesToPrint: string[] = [];

                if (mode === 'whole') {
                    filesToPrint = getAllCodeFiles(root);
                    if (filesToPrint.length === 0) {
                        vscode.window.showErrorMessage('No code files found in project!');
                        return;
                    }
                } else {
                    if (!selectedFiles || selectedFiles.length === 0) {
                        vscode.window.showErrorMessage('Please select at least one file!');
                        return;
                    }
                    filesToPrint = selectedFiles.map((f: string) =>
                        path.join(root, f)
                    );
                }

                const saveUri = await vscode.window.showSaveDialog({
                    defaultUri: vscode.Uri.file(path.join(root, 'code_output.pdf')),
                    filters: { 'PDF Files': ['pdf'] }
                });

                if (!saveUri) { return; }

                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: 'CodePDF Exporter: Generating PDF...',
                    cancellable: false
                }, async () => {
                    try {
                        await generatePDF(
                            filesToPrint,
                            font,
                            parseInt(size, 10),
                            saveUri.fsPath,
                            newPagePerFile !== false,
                            showLineNumbers
                        );
                        vscode.window.showInformationMessage(
                            'PDF saved successfully!', 'Open PDF'
                        ).then(selection => {
                            if (selection === 'Open PDF') {
                                vscode.env.openExternal(saveUri);
                            }
                        });
                    } catch (err) {
                        vscode.window.showErrorMessage(`Failed to generate PDF: ${err}`);
                    }
                });
            }
        });
    }

    getWebviewContent(): string {
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CodePDF Exporter</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: var(--vscode-sideBar-background);
            color: var(--vscode-sideBar-foreground);
            padding: 12px;
            font-size: 13px;
        }

        .section {
            margin-bottom: 14px;
        }

        .section-label {
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: var(--vscode-sideBarSectionHeader-foreground);
            margin-bottom: 5px;
            opacity: 0.7;
        }

        /* Mode buttons */
        .mode-group { display: flex; flex-direction: column; gap: 4px; }

        .mode-btn {
            width: 100%;
            padding: 6px 10px;
            background: transparent;
            color: var(--vscode-sideBar-foreground);
            border: 1px solid var(--vscode-input-border, #454545);
            border-radius: 2px;
            font-size: 13px;
            cursor: pointer;
            text-align: left;
            transition: background 0.1s;
        }

        .mode-btn:hover {
            background: var(--vscode-list-hoverBackground);
        }

        .mode-btn.active {
            background: var(--vscode-button-background, #0e639c);
            color: var(--vscode-button-foreground, #fff);
            border-color: var(--vscode-button-background, #0e639c);
        }

        /* File list */
        .file-list-wrap { display: none; margin-top: 6px; }
        .file-list-wrap.visible { display: block; }

        .select-all-row {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 4px 6px;
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border, #454545);
            border-bottom: none;
            border-radius: 2px 2px 0 0;
            font-size: 11px;
            font-weight: 600;
        }

        .file-list-box {
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border, #454545);
            border-radius: 0 0 2px 2px;
            max-height: 160px;
            overflow-y: auto;
        }

        .file-item {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 4px 6px;
            font-size: 12px;
            cursor: pointer;
        }

        .file-item:hover { background: var(--vscode-list-hoverBackground); }

        .file-item input[type=checkbox] {
            accent-color: var(--vscode-button-background, #0e639c);
            cursor: pointer;
            flex-shrink: 0;
        }

        .file-item span {
            word-break: break-all;
            line-height: 1.4;
        }

        .loading-text {
            padding: 8px 6px;
            font-size: 12px;
            opacity: 0.6;
        }

        /* Font select */
        select {
            width: 100%;
            padding: 5px 8px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border, #454545);
            border-radius: 2px;
            font-size: 13px;
            cursor: pointer;
            outline: none;
        }

        select:focus { border-color: var(--vscode-focusBorder); }

        /* Slider */
        .slider-row { display: flex; align-items: center; gap: 8px; }

        input[type=range] {
            flex: 1;
            height: 2px;
            accent-color: var(--vscode-button-background, #0e639c);
            cursor: pointer;
            outline: none;
            -webkit-appearance: none;
            background: var(--vscode-input-border, #454545);
            border-radius: 2px;
        }

        input[type=range]::-webkit-slider-thumb {
            -webkit-appearance: none;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: var(--vscode-button-background, #0e639c);
            cursor: pointer;
        }

        input[type=range]:focus { outline: none; box-shadow: none; }

        .size-val {
            font-size: 12px;
            font-weight: 600;
            min-width: 28px;
            color: var(--vscode-button-background, #0e639c);
        }

        /* Options */
        .option-row {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 4px 0;
            font-size: 13px;
            cursor: pointer;
        }

        .option-row input[type=checkbox] {
            accent-color: var(--vscode-button-background, #0e639c);
            cursor: pointer;
            flex-shrink: 0;
        }

        /* Preview */
        .preview-box {
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border, #454545);
            border-radius: 2px;
            padding: 8px;
            font-size: 11px;
            line-height: 1.5;
            white-space: pre;
            overflow-x: auto;
        }

        .kw { color: #569cd6; }
        .fn { color: #dcdcaa; }
        .st { color: #ce9178; }
        .cm { color: #6a9955; }
        .nm { color: #b5cea8; }

        /* Generate button */
        .generate-btn {
            width: 100%;
            padding: 8px;
            background: var(--vscode-button-background, #0e639c);
            color: var(--vscode-button-foreground, #fff);
            border: none;
            border-radius: 2px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.1s;
        }

        .generate-btn:hover {
            background: var(--vscode-button-hoverBackground, #1177bb);
        }
    </style>
</head>
<body>

    <div class="section">
        <div class="section-label">Print Mode</div>
        <div class="mode-group">
            <button class="mode-btn active" id="btn-whole" onclick="setMode('whole')">
                📁 Whole Project
            </button>
            <button class="mode-btn" id="btn-select" onclick="setMode('select')">
                📄 Select Specific Files
            </button>
        </div>

        <div class="file-list-wrap" id="fileListWrap">
            <div class="select-all-row">
                <input type="checkbox" id="selectAll" onchange="toggleSelectAll(this)" checked>
                <label for="selectAll">Select All</label>
            </div>
            <div class="file-list-box" id="fileListBox">
                <div class="loading-text">Loading files...</div>
            </div>
        </div>
    </div>

    <div class="section">
        <div class="section-label">Font Family</div>
        <select id="font" onchange="updatePreview()">
            <option value="Times New Roman">Times New Roman</option>
            <option value="Calibri">Calibri</option>
            <option value="Arial">Arial</option>
            <option value="Georgia">Georgia</option>
            <option value="Garamond">Garamond</option>
            <option value="Courier New">Courier New</option>
            <option value="Verdana">Verdana</option>
            <option value="Tahoma">Tahoma</option>
        </select>
    </div>

    <div class="section">
        <div class="section-label">Font Size</div>
        <div class="slider-row">
            <input type="range" id="size" min="8" max="20" value="12" oninput="updatePreview()">
            <span class="size-val" id="sizeVal">12px</span>
        </div>
    </div>

    <div class="section">
        <div class="section-label">Options</div>
        <div class="option-row">
            <input type="checkbox" id="newPagePerFile" checked>
            <label for="newPagePerFile">Each file starts on a new page</label>
        </div>
        <div class="option-row">
            <input type="checkbox" id="showLineNumbers" checked>
            <label for="showLineNumbers">Show line numbers</label>
        </div>
    </div>

    <div class="section">
        <div class="section-label">Preview</div>
        <div class="preview-box" id="preview"><span class="kw">import</span> * <span class="kw">as</span> vscode <span class="kw">from</span> <span class="st">'vscode'</span>;

<span class="kw">function</span> <span class="fn">activate</span>(context) {
    <span class="cm">// Register command</span>
    <span class="kw">const</span> x = <span class="nm">42</span>;
}</div>
    </div>

    <button class="generate-btn" onclick="generate()">📄 Generate PDF</button>

    <script>
        const vscode = acquireVsCodeApi();
        let currentMode = 'whole';
        let loadedFiles = [];
        let rootPath = '';

        function setMode(mode) {
            currentMode = mode;
            document.getElementById('btn-whole').classList.toggle('active', mode === 'whole');
            document.getElementById('btn-select').classList.toggle('active', mode === 'select');
            const wrap = document.getElementById('fileListWrap');
            if (mode === 'select') {
                wrap.classList.add('visible');
                vscode.postMessage({ command: 'loadFiles' });
            } else {
                wrap.classList.remove('visible');
            }
        }

        function toggleSelectAll(checkbox) {
            document.querySelectorAll('.file-checkbox')
                .forEach(cb => cb.checked = checkbox.checked);
        }

        window.addEventListener('message', event => {
            const msg = event.data;
            if (msg.command === 'showFiles') {
                loadedFiles = msg.files;
                rootPath = msg.rootPath;
                const box = document.getElementById('fileListBox');
                if (loadedFiles.length === 0) {
                    box.innerHTML = '<div class="loading-text">No code files found.</div>';
                    return;
                }
                box.innerHTML = loadedFiles.map((f, i) => \`
                    <div class="file-item">
                        <input type="checkbox" class="file-checkbox" id="f\${i}" value="\${f}" checked>
                        <span onclick="document.getElementById('f\${i}').click()">\${f}</span>
                    </div>
                \`).join('');
            }
        });

        function updatePreview() {
            const font = document.getElementById('font').value;
            const size = document.getElementById('size').value;
            document.getElementById('sizeVal').textContent = size + 'px';
            document.getElementById('preview').style.fontFamily = font;
            document.getElementById('preview').style.fontSize = size + 'px';
        }

        function generate() {
            const font = document.getElementById('font').value;
            const size = document.getElementById('size').value;
            let selectedFiles = [];
            if (currentMode === 'select') {
                selectedFiles = Array.from(
                    document.querySelectorAll('.file-checkbox:checked')
                ).map(cb => cb.value);
                if (selectedFiles.length === 0) {
                    alert('Please select at least one file!');
                    return;
                }
            }
            const newPagePerFile = document.getElementById('newPagePerFile').checked;
            const showLineNumbers = document.getElementById('showLineNumbers').checked;
            vscode.postMessage({
                command: 'generate',
                font, size,
                mode: currentMode,
                selectedFiles,
                rootPath,
                newPagePerFile,
                showLineNumbers
            });
        }

        updatePreview();
    </script>
</body>
</html>
`;
    }
}

export function deactivate() { }
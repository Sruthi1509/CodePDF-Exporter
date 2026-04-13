import * as path from 'path';
import * as fs from 'fs';
import { PDFDocument, rgb, StandardFonts, PDFFont } from 'pdf-lib';

const SKIP_FOLDERS = [
    'node_modules', '.git', '.venv', 'venv', '__pycache__',
    '.vscode', 'dist', 'build', 'out', 'env', '.env',
    '.idea', '.mypy_cache', '.pytest_cache'
];

const SKIP_FILES = [
    'README.md', 'readme.md', 'requirements.txt',
    'package-lock.json', '.gitignore', '.vscodeignore',
    'CHANGELOG.md', 'LICENSE', 'license', '.DS_Store',
    'thumbs.db', 'webpack.config.js', 'esbuild.js',
    'eslint.config.mjs', '.vscode-test.mjs'
];

const SKIP_EXTENSIONS = [
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico',
    '.pdf', '.zip', '.exe', '.dll', '.bin', '.map',
    '.lock', '.log'
];

const CODE_EXTENSIONS = [
    '.ts', '.js', '.py', '.java', '.cpp', '.c', '.cs',
    '.html', '.css', '.scss', '.php', '.rb', '.go',
    '.rs', '.swift', '.kt', '.dart', '.tsx', '.jsx',
    '.vue', '.sh', '.bash', '.yaml', '.yml', '.xml'
];

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN_LEFT = 40;    // ~0.55 inch — compact margin like reference
const MARGIN_RIGHT = 72;
const MARGIN_TOP = 72;
const MARGIN_BOTTOM = 40;

// Line number column
const LINE_NUM_COL_WIDTH = 28;
const LINE_NUM_GAP = 8;
const CODE_X = MARGIN_LEFT + LINE_NUM_COL_WIDTH + LINE_NUM_GAP;
const CODE_WIDTH = PAGE_WIDTH - CODE_X - MARGIN_RIGHT;

export function getAllCodeFiles(dirPath: string): string[] {
    const results: string[] = [];
    function walk(currentPath: string) {
        let entries;
        try { entries = fs.readdirSync(currentPath); } catch { return; }
        for (const entry of entries) {
            if (SKIP_FOLDERS.includes(entry)) { continue; }
            if (SKIP_FILES.includes(entry)) { continue; }
            const fullPath = path.join(currentPath, entry);
            let stat;
            try { stat = fs.statSync(fullPath); } catch { continue; }
            if (stat.isDirectory()) {
                walk(fullPath);
            } else {
                const ext = path.extname(entry).toLowerCase();
                if (SKIP_EXTENSIONS.includes(ext)) { continue; }
                if (CODE_EXTENSIONS.includes(ext)) { results.push(fullPath); }
            }
        }
    }
    walk(dirPath);
    return results;
}

function wrapLine(line: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
    if (line.length === 0) { return ['']; }
    const chunks: string[] = [];
    let remaining = line;
    while (remaining.length > 0) {
        let currentWidth = 0;
        let splitIndex = 0;
        for (let i = 0; i < remaining.length; i++) {
            const charWidth = font.widthOfTextAtSize(remaining[i], fontSize);
            if (currentWidth + charWidth > maxWidth && splitIndex > 0) {
                break;
            }
            currentWidth += charWidth;
            splitIndex++;
        }
        if (splitIndex === 0) {
            splitIndex = 1;
        }
        chunks.push(remaining.substring(0, splitIndex));
        remaining = remaining.substring(splitIndex);
    }
    return chunks;
}

export async function generatePDF(
    files: string[],
    fontName: string,
    fontSize: number,
    outputPath: string,
    newPagePerFile: boolean = true,
    showLineNumbers: boolean = true
): Promise<void> {
    let standardFontEnum = StandardFonts.Courier;
    let boldStandardFontEnum = StandardFonts.HelveticaBold;

    switch(fontName) {
        case 'Times New Roman':
        case 'Georgia':
        case 'Garamond':
            standardFontEnum = StandardFonts.TimesRoman;
            boldStandardFontEnum = StandardFonts.TimesRomanBold;
            break;
        case 'Arial':
        case 'Helvetica':
        case 'Calibri':
        case 'Verdana':
        case 'Tahoma':
            standardFontEnum = StandardFonts.Helvetica;
            boldStandardFontEnum = StandardFonts.HelveticaBold;
            break;
        case 'Courier New':
        case 'Courier':
        default:
            standardFontEnum = StandardFonts.Courier;
            boldStandardFontEnum = StandardFonts.CourierBold;
            break;
    }

    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(standardFontEnum);
    const boldFont = await pdfDoc.embedFont(boldStandardFontEnum);

    const lineHeight = fontSize * 1.6;
    const codeStartX = showLineNumbers ? CODE_X : 72;
    const codeWidth = showLineNumbers ? CODE_WIDTH : PAGE_WIDTH - 72 - MARGIN_RIGHT;

    let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let currentY = PAGE_HEIGHT - MARGIN_TOP;

    for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
        const filePath = files[fileIndex];
        const fileName = path.basename(filePath);

        let code = '';
        try { code = fs.readFileSync(filePath, 'utf8'); }
        catch { code = '// Could not read file'; }

        const rawLines = code.replace(/\r/g, '').split('\n');

        if (fileIndex > 0) {
            if (newPagePerFile) {
                page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
                currentY = PAGE_HEIGHT - MARGIN_TOP;
            } else {
                // Add extra gap between files
                currentY -= lineHeight * 2;
                if (currentY - lineHeight * 3 < MARGIN_BOTTOM) {
                    page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
                    currentY = PAGE_HEIGHT - MARGIN_TOP;
                }
            }
        }

        // ── File Title — left aligned with code ──
        page.drawText(fileName, {
            x: codeStartX,
            y: currentY,
            size: 13,
            font: boldFont,
            color: rgb(0, 0, 0),
        });
        currentY -= lineHeight + 4;

        // ── Code Lines ──
        for (let lineNum = 0; lineNum < rawLines.length; lineNum++) {
            const rawLine = rawLines[lineNum];
            const sanitized = rawLine
                .replace(/\t/g, '    ')
                .replace(/[^\x20-\x7E]/g, ' ');
            const chunks = wrapLine(sanitized, font, fontSize, codeWidth);

            for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
                const chunk = chunks[chunkIndex];

                // New page if needed
                if (currentY - lineHeight < MARGIN_BOTTOM) {
                    page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
                    currentY = PAGE_HEIGHT - MARGIN_TOP;
                }

                // Line number — starts at MARGIN_LEFT, right aligned within column
                if (showLineNumbers && chunkIndex === 0) {
                    const lineNumStr = String(lineNum + 1);
                    const numWidth = font.widthOfTextAtSize(lineNumStr, fontSize);
                    page.drawText(lineNumStr, {
                        x: MARGIN_LEFT + LINE_NUM_COL_WIDTH - numWidth,
                        y: currentY,
                        size: fontSize,
                        font: font,
                        color: rgb(0.55, 0.55, 0.55),
                    });
                }

                // Vertical separator
                if (showLineNumbers) {
                    page.drawLine({
                        start: { x: MARGIN_LEFT + LINE_NUM_COL_WIDTH + 4, y: currentY + fontSize },
                        end: { x: MARGIN_LEFT + LINE_NUM_COL_WIDTH + 4, y: currentY - 2 },
                        thickness: 0.3,
                        color: rgb(0.75, 0.75, 0.75),
                    });
                }

                // Code text
                if (chunk.length > 0) {
                    page.drawText(chunk, {
                        x: codeStartX,
                        y: currentY,
                        size: fontSize,
                        font: font,
                        color: rgb(0.05, 0.05, 0.05),
                    });
                }

                currentY -= lineHeight;
            }
        }
    }
    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(outputPath, pdfBytes);
}
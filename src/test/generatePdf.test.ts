import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { generatePDF } from '../pdfGenerator';

suite('generatePDF Decimal Font Size Test', () => {
    test('generatePDF accepts decimal font size and produces a non-empty PDF', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codepdf-test-'));
        const codeFile = path.join(tmpDir, 'sample.ts');
        const outPdf = path.join(tmpDir, 'out.pdf');

        const sampleCode = `function hello() {\n  console.log('hi');\n}\n`;
        fs.writeFileSync(codeFile, sampleCode, 'utf8');

        // Use a decimal font size
        const fontSize = 12.5;

        // Should not throw
        await generatePDF([codeFile], 'Courier New', fontSize, outPdf, true, true);

        assert.ok(fs.existsSync(outPdf), 'PDF file should exist');
        const stats = fs.statSync(outPdf);
        assert.ok(stats.size > 0, 'PDF file should be non-empty');

        // Clean up
        try { fs.unlinkSync(codeFile); } catch {}
        try { fs.unlinkSync(outPdf); } catch {}
        try { fs.rmdirSync(tmpDir); } catch {}
    });
});

import * as fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

async function testPdf() {
    console.log("Starting...");
    const data = fs.readFileSync('../ENTRADA.pdf');
    const doc = await pdfjsLib.getDocument(data).promise;
    
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
        const page = await doc.getPage(pageNum);
        const textContent = await page.getTextContent();
        
        const linesMap = {};
        for (const item of textContent.items) {
            if ('str' in item) {
                const y = Math.round(item.transform[5] / 2) * 2; 
                if (!linesMap[y]) linesMap[y] = [];
                linesMap[y].push(item);
            }
        }
        
        const yKeys = Object.keys(linesMap).map(Number).sort((a, b) => b - a);
        
        console.log(`\n\n=== PAGE ${pageNum} ===\n`);
        
        // Simulating the heuristics from pdfParser.ts:
        let produtorAtual = "PRODUTOR DESCONHECIDO";

        for (const y of yKeys) {
            const lineItems = linesMap[y].sort((a, b) => a.transform[4] - b.transform[4]);
            const lineText = lineItems.map(i => i.str).join(' ').trim();
            const originalLine = lineText;

            // 1. Heuristic: Producer Name
            const numeroLongoMatch = lineText.match(/\d{11,14}/);
            if (numeroLongoMatch && lineText.length > 10 && !lineText.match(/\d{2}\/\d{2}\/\d{4}/) && !lineText.includes('SOJA')) {
                const nomeExtraido = lineText.replace(/[\d-\.\/]{10,}/g, '').trim();
                if (nomeExtraido.length > 3) {
                    produtorAtual = nomeExtraido;
                }
            }

            // 2. Heuristic: Load
            const dateMatch = lineText.match(/\d{2}\/\d{2}\/\d{4}/);
            if (dateMatch && (lineText.includes('SOJA') || lineText.includes('DECLARADA') || lineText.includes('INDUSTRIA') || lineText.includes('TESTADA'))) {
                 // It's a load segment!
                 console.log(`\n----> Found Load for Produtor: ${produtorAtual}`);
                 console.log("LINE: ", lineText);
            }
        }
        if (pageNum >= 2) break; // limit
    }
}

testPdf().catch(console.error);

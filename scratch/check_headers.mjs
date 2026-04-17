import pkg from 'xlsx';
const { readFile, utils } = pkg;
import * as path from 'path';

const filePath = path.join(process.cwd(), 'public', 'modelo_comparativo.xlsx');
try {
    const wb = readFile(filePath);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rawData = utils.sheet_to_json(ws, { header: 1 });
    
    // Pega a Linha 2 (Index 1) que é onde estão os nomes das colunas
    const headers = rawData[1];
    console.log('--- COLUNAS REAIS DETECTADAS NA LINHA 2 ---');
    console.log(headers);
} catch (e) {
    console.log('Erro:', e.message);
}

import pkg from 'xlsx';
const { readFile, writeFile, utils } = pkg;
import * as path from 'path';

const filePath = path.join(process.cwd(), 'public', 'main.xlsx');
// Usando o novo nome de arquivo detectado
const sourcePath = path.join(process.cwd(), '..', 'MODELO ACUMULADOS 2526.xlsx');

try {
    const wb = readFile(sourcePath);
    const ws = wb.Sheets[wb.SheetNames[0]];

    Object.keys(ws).forEach(key => {
        if (key[0] === '!') return;
        const row = parseInt(key.replace(/^[A-Z]+/, ''), 10);
        if (row > 2) {
            delete ws[key];
        }
    });

    ws['!ref'] = 'A1:AF2';

    writeFile(wb, filePath);
    console.log('Modelo limpo preservando formatação em public/main.xlsx');
} catch (e) {
    console.log('Erro ao processar planilha:', e.message);
}

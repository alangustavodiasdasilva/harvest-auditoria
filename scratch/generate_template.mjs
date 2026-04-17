import * as xlsx from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

// Modelo simplificado com apenas as colunas essenciais solicitadas
const data = [
  {
    'ROMANEIO': '',
    'PRODUTOR': '',
    'PLACA': '',
    'PESO LÍQUIDO C/ DESCONTO (KG)': '',
    'RESULTADO DO TESTE': ''
  }
];

const ws = xlsx.utils.json_to_sheet(data);
const wb = xlsx.utils.book_new();
xlsx.utils.book_append_sheet(wb, ws, 'Modelo_Acumulado');

const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
const targetPath = path.join(process.cwd(), 'public', 'modelo_comparativo.xlsx');

fs.writeFileSync(targetPath, buffer);
console.log(`Modelo simplificado desenvolvido em: ${targetPath}`);

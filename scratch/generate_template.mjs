import * as xlsx from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

const data = [
  {
    'NÚMERO DOCUMENTO': '252',
    'PRODUTOR': 'VICENTE RIVA',
    'PLACA': 'ITN3683',
    'PESO LÍQUIDO C/ DESCONTO (KG)': 13910,
    'TESTE': 'Declarada',
    'UNIDADE': 'UNIDADE EXEMPLO'
  },
  {
    'NÚMERO DOCUMENTO': '253',
    'PRODUTOR': 'EXEMPLO RATEIO 1',
    'PLACA': 'ABC1234',
    'PESO LÍQUIDO C/ DESCONTO (KG)': 5000,
    'TESTE': 'Negativa',
    'UNIDADE': 'UNIDADE EXEMPLO'
  },
  {
    'NÚMERO DOCUMENTO': '253',
    'PRODUTOR': 'EXEMPLO RATEIO 2',
    'PLACA': 'ABC1234',
    'PESO LÍQUIDO C/ DESCONTO (KG)': 8000,
    'TESTE': 'Negativa',
    'UNIDADE': 'UNIDADE EXEMPLO'
  }
];

const ws = xlsx.utils.json_to_sheet(data);
const wb = xlsx.utils.book_new();
xlsx.utils.book_append_sheet(wb, ws, 'Acumulado');

const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
const targetPath = path.join(process.cwd(), 'public', 'modelo_comparativo.xlsx');

fs.writeFileSync(targetPath, buffer);
console.log(`Modelo criado em: ${targetPath}`);

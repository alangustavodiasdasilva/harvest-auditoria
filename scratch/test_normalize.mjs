import pkg from 'xlsx';
const { readFile, utils } = pkg;
import * as path from 'path';

// Função auxiliar para normalizar nomes (remover acentos e espaços)
function normalize(str) {
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
}

console.log('--- TESTE DE NORMALIZAÇÃO ---');
console.log('ANDRÉ ALEXANDRE == ANDRE ALEXANDRE:', normalize('ANDRÉ ALEXANDRE') === normalize('ANDRE ALEXANDRE'));

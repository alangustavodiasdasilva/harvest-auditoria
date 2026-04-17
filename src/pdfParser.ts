import * as pdfjsLib from 'pdfjs-dist';

// Configurando o worker nativamente via unpkg para funcionar 100% no Vite
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

export interface CargaPDF {
  produtor: string;
  data: string;
  placa: string;
  pesoLiquido: number;
  resultadoTeste: string;
  documento: string;
}

export const extrairCargasDoPDF = async (file: File): Promise<CargaPDF[]> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDocument = await pdfjsLib.getDocument(arrayBuffer).promise;
  
  const allCargas: CargaPDF[] = [];
  let produtorAtual = 'PRODUTOR DESCONHECIDO';
  
  for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
    const page = await pdfDocument.getPage(pageNum);
    const textContent = await page.getTextContent();
    
    // Agrupa os itens de texto por suas coordenadas Y (linhas horizontais)
    const linesMap: Record<number, any[]> = {};
    
    for (const item of textContent.items) {
      if ('str' in item) {
         const y = Math.round(item.transform[5] / 2) * 2; // Agrupar em faixas de 2 pixels
         if (!linesMap[y]) linesMap[y] = [];
         linesMap[y].push(item);
      }
    }

    // Ordena as linhas do topo para a base (Y maior para Y menor em PDFs)
    const yKeys = Object.keys(linesMap).map(Number).sort((a, b) => b - a);
    
    
    for (const y of yKeys) {
        // Ordena os itens da linha da esquerda para a direita (X)
        const lineItems = linesMap[y].sort((a, b) => a.transform[4] - b.transform[4]);
        const lineText = lineItems.map(i => i.str).join(' ').trim();
        
        // Pula cabeçalhos explícitos
        if (lineText.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/) || lineText.match(/Sistema de Controle/i) || lineText.match(/Página:/i)) {
            continue;
        }

        // Identificar produtor: Pega qualquer linha grossa que não seja os cabeçalhos das tabelas nem cargas
        if (lineText.length > 5 && !lineText.match(/\d{2}\/\d{2}\/\d{4}/) && !lineText.includes('SOJA') && !lineText.includes('MILHO') && !lineText.includes('TRIGO') && !lineText.includes('Cód') && !lineText.includes('Peso') && !lineText.includes('Total') && !lineText.includes('Tot.')) {
            let nomeExtraido = lineText;
            const numCount = (lineText.match(/\d/g) || []).length;
            if (numCount >= 4) {
                // Remove qualquer numeração longa, CPF, CNPJ ou IDs à direita (Corte brutal)
                nomeExtraido = lineText.replace(/[\d\.\-\/]{6,}.*$/, '').trim();
            }
            // Purifica deixando somente letras/espaços pro Nome do Produtor
            nomeExtraido = nomeExtraido.replace(/[0-9]/g, '').trim();

            if (nomeExtraido.length > 4) {
                produtorAtual = nomeExtraido;
            }
        }
        
        // Detecta uma carga se tem Data (+ Produto)
        const dateMatch = lineText.match(/\d{2}\/\d{2}\/\d{4}/);
        if (dateMatch && (lineText.includes('SOJA') || lineText.includes('MILHO') || lineText.includes('TRIGO') || lineText.includes('DECLARADA') || lineText.includes('INDUSTRIA') || lineText.includes('TESTADA'))) {
            const dataStr = dateMatch[0];
            const parts = lineText.split(/\s+/);
            const dataIndex = parts.indexOf(dataStr);
            
            // Tenta achar placa padrão Mercosul/Antiga (ex: QIR0A32)
            const placaMatch = lineText.match(/[A-Z]{3}\d[A-Z\d]\d{2}/);
            let placaStr = placaMatch ? placaMatch[0] : 'S/ PLACA';
            
            // Se não achou placa padrão, tenta pescar pela posição adjacente à Data
            if (placaStr === 'S/ PLACA' && dataIndex !== -1) {
               // No PDF antigo, placa era logo DEPOIS da data: 21/03/2026 JAB9G38
               if (parts[dataIndex + 1] && !parts[dataIndex + 1].includes('/')) {
                   placaStr = parts[dataIndex + 1];
               } 
               // No PDF NOVO (ENTRADA.pdf), placa é +2 posições APÓS a data: 10/01/2026 0 1
               else if (parts[dataIndex + 2] && !parts[dataIndex + 2].includes('/')) {
                   placaStr = parts[dataIndex + 2];
               }
            }
            
            // Corrige se pegou lixo
            if (placaStr.length > 8 || placaStr.includes(',')) placaStr = 'S/ PLACA';

            // Identifica o Resultado / Tipo
            let rTeste = 'TIPO DESCONHECIDO';
            if (lineText.includes('DECLARADA')) rTeste = 'DECLARADA';
            else if (lineText.includes('INDUSTRIA') && !lineText.includes('DECLARADA')) rTeste = 'TESTADA NEGATIVA';
            else if (lineText.includes('TESTADA')) rTeste = 'TESTADA';
            
            // Tenta pegar o Peso Líquido
            let pesoLq = 0;
            const numberTokens = parts.filter(t => /^[\d.,]{4,}$/.test(t));
            
            if (numberTokens.length > 0) {
                // Estratégia Bimodal:
                // Se o layout tiver a Data no Fim, os pesos estão no Início (parts[1], parts[2])
                // Se o layout tiver a Data no Início, o peso tá no Fim do lineText!
                let strPesoAlvo = '';
                if (dataIndex > parts.length / 2) {
                    // Layout Antigo
                    strPesoAlvo = numberTokens[1] || numberTokens[0];
                } else {
                    // Layout Novo (ENTRADA.pdf) -> sempre é o ÚLTIMO número
                    strPesoAlvo = numberTokens[numberTokens.length - 1];
                }
                
                if (strPesoAlvo) {
                    if (strPesoAlvo.includes('.') && !strPesoAlvo.includes(',')) {
                       pesoLq = parseFloat(strPesoAlvo.replace(/\./g, ''));
                    } else if (strPesoAlvo.includes(',')) {
                       pesoLq = parseFloat(Number(strPesoAlvo.replace(/\./g, '').replace(',', '.')).toFixed(2));
                    } else {
                       pesoLq = parseFloat(strPesoAlvo);
                    }
                }
            }

            // Tática Inteligente Bimodal de Extração do Romaneio
            let docRomaneio = '-';
            const sojaIdx = parts.findIndex(p => p.includes('SOJA') || p.includes('MILHO') || p.includes('TRIGO'));
            
            // O layout com a Data pro Fim do texto é o Relatório Antigo. Nele o Romaneio/Ticket tá colado atrás do Tipo de Grão.
            if (dataIndex > parts.length / 2) {
                if (sojaIdx > 0 && /^\d+$/.test(parts[sojaIdx - 1])) {
                    docRomaneio = parts[sojaIdx - 1];
                }
            } 
            // O layout com a Data mais pro Início do texto é o Acumulado Novo. Nele o Romaneio tá no começo da linha.
            else {
                if (parts[0] && /^\d+$/.test(parts[0])) {
                    docRomaneio = parts[0];
                }
            }
            
            // 3) Fallback cego: O primeiro bloco de 4 a 8 dígitos solto
            if (docRomaneio === '-') {
                const possiveisIds = parts.filter(p => /^\d{4,8}$/.test(p));
                if (possiveisIds.length > 0) docRomaneio = possiveisIds[0];
            }

            // Exclui lixos (Se pegou pesoLq < 50 ou algo falhou, não é carga real, é lixo intermitente)
            if (pesoLq > 50) {
                allCargas.push({
                   produtor: produtorAtual,
                   data: dataStr,
                   placa: placaStr,
                   pesoLiquido: pesoLq,
                   resultadoTeste: rTeste,
                   documento: docRomaneio
                });
            }
        }
    }
  }
  
  return allCargas;
};

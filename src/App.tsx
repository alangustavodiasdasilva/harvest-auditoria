import { useState } from 'react';
import * as xlsx from 'xlsx';

import { UploadCloud, CheckCircle, AlertCircle, AlertTriangle, Truck, MapPin, Scale, User, FileSpreadsheet, Users, X, Calendar, Clock, ClipboardType, Building2, EyeOff, Eye, ShieldAlert, Hash, ArrowLeftRight, FileCode, HelpCircle, Search } from 'lucide-react';
import './App.css';

interface CargaDetalhe {
  data: string;
  horario: string;
  timestamp: number;
  unidade: string;
  resultadoTeste: string;
  documento: string;
  numeroDocumento: number | null; 
  auditor: string;
  placa: string;
  produtor: string;
  cnpj: string;
  naoAcompanhada: boolean;
  peso: number;
  pesoAuditado: number;
}

interface EntityData {
  nome: string;
  cnpj: string; 
  subitems: string[];
  totalCargas: number;
  pesoTotalEntregue: number;
  declaradas: number;
  testadasPositivas: number;
  testadasNegativas: number;
  pesoDeclaradas: number;
  pesoPositivas: number;
  pesoNegativas: number;
  participantes: number;
  outros: number;
  pesoAuditadoTotal: number;
  detalhesCargas: CargaDetalhe[];
  horasCount: Record<number, number>;
  horarioPico: string;
}

interface AlertaCritico {
  tipo: 'PLACA_SUSPEITA' | 'FURO_SEQUENCIA' | 'FALTA_ACOMPANHAMENTO';
  nivel: 'CRITICO' | 'ALTO' | 'MEDIO';
  titulo: string;
  descricao: string;
  dadosReferencia: any;
  timestamp: number;
  cargasEnvolvidas: CargaDetalhe[];
}

function parseDataHora(data: string, horaStr: string): number {
  try {
    const [dia, mes, ano] = data.split('/').map(Number);
    let hora = 0, min = 0;
    if (horaStr && horaStr.includes(':')) {
       [hora, min] = horaStr.split(':').map(Number);
    }
    const d = new Date(ano, mes - 1, dia, hora || 0, min || 0);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  } catch (e) {
    return 0;
  }
}

const getVal = (obj: any, keys: string[]) => {
  if (!obj) return null;
  // Criamos uma versão normalizada das chaves do objeto para comparação rápida
  const objKeysMap: Record<string, string> = {};
  for (const prop in obj) {
    if (!prop) continue;
    const normProp = prop.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    objKeysMap[normProp] = prop;
  }

  // Percorremos as chaves enviadas na ordem de prioridade
  for (const key of keys) {
    const normKey = key.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (objKeysMap[normKey]) {
      return obj[objKeysMap[normKey]];
    }
  }
  return null;
};

function App() {
  const [dataProdutores, setDataProdutores] = useState<EntityData[]>([]);
  const [dataFiliais, setDataFiliais] = useState<EntityData[]>([]);
  const [alertasCriticos, setAlertasCriticos] = useState<AlertaCritico[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('padrao');
  
  const [activeTab, setActiveTab] = useState<'produtor' | 'filial' | 'auditoria' | 'comparativo'>('filial');
  const [selectedEntity, setSelectedEntity] = useState<EntityData | null>(null);
  
  // Estados para o Comparativo
  const [allCargas, setAllCargas] = useState<CargaDetalhe[]>([]);
  const [comparativoResult, setComparativoResult] = useState<any[]>([]);
  const [selectedFilialForComp, setSelectedFilialForComp] = useState<string>('');
  const [loadingComp, setLoadingComp] = useState(false);
  const [compFilialSearch, setCompFilialSearch] = useState('');
  const [searchTermResultsComp, setSearchTermResultsComp] = useState('');
  const [filterStatusComp, setFilterStatusComp] = useState<'TUDO' | 'OK' | 'DIVERGENTE' | 'INCONSISTENTE' | 'RATEIO'>('TUDO');

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(num);
  };

  const renderFilialNameWithCnpj = (unidade: string) => {
    const parts = unidade.split(' (');
    const nome = parts[0].split(' ').slice(0, 3).join(' ');
    const cnpj = parts[1] ? parts[1].replace(')', '') : '';
    if (cnpj.length >= 5) {
      const suffix = cnpj.slice(-5);
      return <><MapPin size={14}/> {nome} <span className="cnpj-suffix">{suffix}</span></>;
    }
    return <><MapPin size={14}/> {nome}</>;
  };

  const processarAlertas = (todasCargas: CargaDetalhe[]) => {
    const novosAlertas: AlertaCritico[] = [];

    const cargasPorProdutor: Record<string, CargaDetalhe[]> = {};
    todasCargas.forEach(c => {
       if (c.produtor && c.produtor !== 'NÃO INFORMADO') {
          if (!cargasPorProdutor[c.produtor]) cargasPorProdutor[c.produtor] = [];
          cargasPorProdutor[c.produtor].push(c);
       }
    });

    for (const produtor in cargasPorProdutor) {
       const cargas = cargasPorProdutor[produtor].sort((a, b) => a.timestamp - b.timestamp);
       
       let tNeg = 0;
       let tPos = 0;
       let tDec = 0;

       cargas.forEach(c => {
           const r = c.resultadoTeste.toLowerCase();
           if (r.includes('negativa')) tNeg++;
           if (r.includes('positiva')) tPos++;
           if (r.includes('declarada')) tDec++;
       });

       if (tNeg > 0 && (tPos > 0 || tDec > 0)) {
           const cargasAlerta = cargas.filter(c => {
               const r = c.resultadoTeste.toLowerCase();
               return r.includes('negativa') || r.includes('positiva') || r.includes('declarada');
           });

           let resumo = [];
           if (tNeg > 0) resumo.push(`${tNeg} carga(s) com teste Negativo`);
           if (tPos > 0) resumo.push(`${tPos} Positiva(s)`);
           if (tDec > 0) resumo.push(`${tDec} Declarada(s)`);
           const prodCnpjStr = cargasAlerta[0].cnpj ? ` [CNPJ/CPF: ***${cargasAlerta[0].cnpj.slice(-4)}]` : '';
           
           novosAlertas.push({
               tipo: 'PLACA_SUSPEITA',
               nivel: 'CRITICO',
               titulo: `Alerta de Testagem Contraditória: ${produtor}${prodCnpjStr}`,
               descricao: `O produtor '${produtor}' acusou uma mistura de qualidade nas entregas. Ele possui: ${resumo.join(' misturadas com ')}. Abaixo o extrato das cargas divergentes em ordem cronológica.`,
               dadosReferencia: { produtor },
               timestamp: cargasAlerta[cargasAlerta.length - 1].timestamp,
               cargasEnvolvidas: cargasAlerta
           });
       }
    }

    setAlertasCriticos(novosAlertas.sort((a,b) => b.timestamp - a.timestamp));
  };


  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError('');



    const reader = new FileReader();

    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = xlsx.read(bstr, { type: 'binary' });
        const wsPdr = wb.Sheets[wb.SheetNames[0]];
        const rawData = xlsx.utils.sheet_to_json(wsPdr, { header: 1 }) as any[];

        if (rawData.length < 2) {
          setError('A planilha parece estar vazia ou mal formatada.');
          setLoading(false);
          return;
        }

        // NOVO: Busca automática pela linha de cabeçalho (procura a linha que contém 'PRODUTOR' ou 'ROMANEIO')
        let headerIndex = 1; // Padrão
        for (let i = 0; i < Math.min(rawData.length, 10); i++) {
          const rowStr = JSON.stringify(rawData[i]).toLowerCase();
          if (rowStr.includes('produtor') || rowStr.includes('romaneio') || rowStr.includes('unidade') || rowStr.includes('documento')) {
            headerIndex = i;
            break;
          }
        }

        const headers: string[] = rawData[headerIndex] || [];
        const rows = rawData.slice(headerIndex + 1);

        const dadosCargas = rows.filter(r => r.length > 0).map(row => {
          let obj: any = {};
          headers.forEach((header, index) => {
            if (header) {
              obj[header.trim()] = row[index];
            }
          });
          return obj;
        });

        const pMap: Record<string, EntityData> = {};
        const fMap: Record<string, EntityData> = {};
        const globalCargasPool: CargaDetalhe[] = [];

        dadosCargas.forEach(carga => {
          let nomeProdutor = getVal(carga, ['PRODUTOR', 'NOME PRODUTOR', 'CLIENTE', 'NOME DO PRODUTOR']);
          if (!nomeProdutor || String(nomeProdutor).trim() === '') nomeProdutor = 'NÃO INFORMADO';

          const nomeBaseFilial = getVal(carga, ['RAZÃO SOCIAL FILIAL PDR', 'UNIDADE PDR', 'UNIDADE', 'FILIAL', 'LOCAL', 'CIDADE FILIAL', 'CIDADE']) || 'UNIDADE DESCONHECIDA';
          const cnpjBaseFilial = getVal(carga, ['CNPJ FILIAL PDR', 'CNPJ DA FILIAL', 'CNPJ FILIAL', 'CNPJ']) || '';
          
          let keyFilial = cnpjBaseFilial ? `${nomeBaseFilial}|${cnpjBaseFilial}` : `${nomeBaseFilial}|S/N`;
          let displayFilial = cnpjBaseFilial ? `${nomeBaseFilial} (${cnpjBaseFilial})` : nomeBaseFilial;

          const pesoRaw = getVal(carga, ['PESO LÍQUIDO C/ DESCONTO (KG)', 'PESO LÍQUIDO (KG)', 'PESO LÍQUIDO', 'PESO LIQUIDO', 'PSP', 'PESO', 'VOLUME', 'TOTAL']);
          let peso = 0;
          if (typeof pesoRaw === 'number') {
             peso = pesoRaw;
          } else if (typeof pesoRaw === 'string') {
             // Limpeza de string para número (remove espaços, pontos de milhar e troca vírgula por ponto)
             const cleanPeso = pesoRaw.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
             peso = parseFloat(cleanPeso) || 0;
          }

          const resultadoTesteOriginal = String(getVal(carga, ['RESULTADO DO TESTE ACOMPANHADO', 'TESTE', 'RESULTADO']) || '').trim();
          const resultadoTeste = resultadoTesteOriginal.toLowerCase();
          const naoAcompFlag = String(getVal(carga, ['NÃO ACOMPANHADA', 'ACOMPANHADA']) || '').trim().toLowerCase() === 'sim';
          
          const dataRaw = getVal(carga, ['DATA', 'DATA EMISSÃO', 'EMISSÃO', 'DT_EMISSAO']);
          let dt = String(dataRaw || '');
          if (typeof dataRaw === 'number' && dataRaw > 30000) {
             const baseDate = new Date(1899, 11, 30);
             dt = new Date(baseDate.getTime() + dataRaw * 86400000).toLocaleDateString('pt-BR');
          }

          const hr = getVal(carga, ['HORÁRIO', 'HORA']) || '';
          const ts = parseDataHora(dt, String(hr));
          
          let hrNum = -1;
          if (hr && hr.includes(':')) {
             hrNum = parseInt(hr.split(':')[0], 10);
          }

          if (!pMap[nomeProdutor]) pMap[nomeProdutor] = { nome: nomeProdutor, cnpj: '', subitems: [], totalCargas: 0, pesoTotalEntregue: 0, declaradas: 0, testadasPositivas: 0, testadasNegativas: 0, pesoDeclaradas: 0, pesoPositivas: 0, pesoNegativas: 0, participantes: 0, outros: 0, pesoAuditadoTotal: 0, detalhesCargas: [], horasCount: {}, horarioPico: '' };
          if (!fMap[keyFilial]) fMap[keyFilial] = { nome: displayFilial, cnpj: cnpjBaseFilial, subitems: [], totalCargas: 0, pesoTotalEntregue: 0, declaradas: 0, testadasPositivas: 0, testadasNegativas: 0, pesoDeclaradas: 0, pesoPositivas: 0, pesoNegativas: 0, participantes: 0, outros: 0, pesoAuditadoTotal: 0, detalhesCargas: [], horasCount: {}, horarioPico: '' };

          const p = pMap[nomeProdutor];
          const f = fMap[keyFilial];

          p.totalCargas++; p.pesoTotalEntregue += peso;
          f.totalCargas++; f.pesoTotalEntregue += peso;
          
          if (hrNum >= 0) {
             p.horasCount[hrNum] = (p.horasCount[hrNum] || 0) + 1;
             f.horasCount[hrNum] = (f.horasCount[hrNum] || 0) + 1;
          }

          if (!p.subitems.includes(displayFilial)) p.subitems.push(displayFilial);
          if (!f.subitems.includes(nomeProdutor)) f.subitems.push(nomeProdutor);

          // Busca robusta pelo número do romaneio/documento
          // Prioridade total para colunas de documento reais, evitando 'Nº' ou 'Cód' genéricos no início
          const docNumRaw = getVal(carga, ['NÚMERO DOCUMENTO', 'ROMANEIO', 'Nº DOCUMENTO', 'Nº DOC', 'DOCUMENTO', 'CÓD. DOCUMENTO', 'COD. DOCUMENTO', 'Cód', 'CÓDIGO', 'COD', 'Nº']) || '-';
          const docNumParsed = !isNaN(parseInt(docNumRaw, 10)) ? parseInt(docNumRaw, 10) : null;

          // NOVO: Captura o peso auditado de forma defensiva
          const pesoAuditRaw = getVal(carga, ['PESO AUDITADO', 'VOLUME AUDITADO', 'AUDITADO (KG)', 'AUDITADO', 'TOTAL AUDITADO', 'VOL. AUDITADO']);
          let pesoAudit = 0;
          if (typeof pesoAuditRaw === 'number') {
             pesoAudit = pesoAuditRaw;
          } else if (typeof pesoAuditRaw === 'string') {
             const cleanAudit = pesoAuditRaw.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
             pesoAudit = parseFloat(cleanAudit) || 0;
          }


          const detalhe: CargaDetalhe = {
             id: (getVal(carga, ['ID']) || `S/ID-${p.totalCargas}`).toString(),
             data: String(dt || 'N/D'),
             horario: String(hr || 'N/D'),
             timestamp: ts,
             peso: peso,
             unidade: displayFilial,
             resultadoTeste: resultadoTesteOriginal || 'Sem Teste',
             documento: String(docNumRaw),
             numeroDocumento: docNumParsed,
             auditor: String(getVal(carga, ['CÓDIGO VISITA', 'EMPRESA HARVEST', 'AUDITOR', 'RESPONSAVEL']) || 'Indisponível'),
             placa: String(getVal(carga, ['PLACA DO CAMINHÃO', 'PLACA', 'VEICULO']) || '-'),
             produtor: String(nomeProdutor),
             cnpj: String(getVal(carga, ['CPF', 'CNPJ', 'CPF PRODUTOR', 'CNPJ PRODUTOR', 'CPF/CNPJ']) || '').trim(),
             naoAcompanhada: naoAcompFlag,
             pesoAuditado: pesoAudit
          };
          
          p.detalhesCargas.push(detalhe);
          f.detalhesCargas.push(detalhe);
          globalCargasPool.push(detalhe);

          p.pesoAuditadoTotal += pesoAudit;
          f.pesoAuditadoTotal += pesoAudit;

          if (resultadoTeste.includes('declarada')) {
            p.declaradas++; f.declaradas++;
            p.pesoDeclaradas += peso; f.pesoDeclaradas += peso;
          } else if (resultadoTeste.includes('positiva')) {
            p.testadasPositivas++; f.testadasPositivas++;
            p.pesoPositivas += peso; f.pesoPositivas += peso;
          } else if (resultadoTeste.includes('negativa')) {
            p.testadasNegativas++; f.testadasNegativas++;
            p.pesoNegativas += peso; f.pesoNegativas += peso;
          } else if (resultadoTeste.includes('participante')) {
            p.participantes++; f.participantes++;
          } else {
            p.outros++; f.outros++;
          }
        });
        
        // Calcular Horários de Pico
        const calcularPico = (entData: EntityData[]) => {
           entData.forEach(ent => {
             let maxHrs = -1;
             let pico = -1;
             for (const h in ent.horasCount) {
                 if (ent.horasCount[h] > maxHrs) {
                     maxHrs = ent.horasCount[h];
                     pico = parseInt(h, 10);
                 }
             }
             if (pico >= 0) {
                 const start = String(pico).padStart(2, '0');
                 const end = String((pico + 1) % 24).padStart(2, '0');
                 ent.horarioPico = `${start}:00 - ${end}:00`;
             } else {
                 ent.horarioPico = 'N/D';
             }
           });
        };
        
        const rProd = Object.values(pMap).sort((a, b) => b.pesoTotalEntregue - a.pesoTotalEntregue);
        const rFilial = Object.values(fMap).sort((a, b) => b.pesoTotalEntregue - a.pesoTotalEntregue);
        
        calcularPico(rProd);
        calcularPico(rFilial);
        
        setDataProdutores(rProd);
        setDataFiliais(rFilial);
        setAllCargas(globalCargasPool);
        
        processarAlertas(globalCargasPool);
        
        // A pedido do usuário, volta para visão de filial
        setActiveTab('filial');
      } catch (err) {
        console.error(err);
        setError('Ocorreu um erro ao processar o arquivo. Verifique se é a planilha correta.');
      } finally {
        setLoading(false);
      }
    };

    reader.readAsBinaryString(file);
  };

  const handleComparativoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedFilialForComp) return;

    setLoadingComp(true);
    setError('');

    const reader = new FileReader();

    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = xlsx.read(bstr, { type: 'binary' });
        const wsPdr = wb.Sheets[wb.SheetNames[0]];
        const rawData = xlsx.utils.sheet_to_json(wsPdr, { header: 1 }) as any[];

        if (rawData.length < 2) {
          setError('A planilha de acumulado parece estar vazia.');
          setLoadingComp(false);
          return;
        }

        // NOVO: Busca automática pela linha de cabeçalho no acumulado
        let headerIndex = 1;
        for (let i = 0; i < Math.min(rawData.length, 10); i++) {
          const rowStr = JSON.stringify(rawData[i]).toLowerCase();
          if (rowStr.includes('produtor') || rowStr.includes('romaneio') || rowStr.includes('unidade') || rowStr.includes('documento')) {
            headerIndex = i;
            break;
          }
        }

        const headers: string[] = rawData[headerIndex] || [];
        const rows = rawData.slice(headerIndex + 1);

        const dadosAcumulado = rows.filter(r => r.length > 0).map(row => {
          let obj: any = {};
          headers.forEach((header, index) => {
            if (header) {
              obj[header.trim()] = row[index];
            }
          });
          return obj;
        });

        // Filtra cargas da auditoria (todas ou apenas a filial selecionada)
        const cargasFilialOriginal = selectedFilialForComp === 'TODAS' 
          ? allCargas 
          : allCargas.filter(c => c.unidade === selectedFilialForComp);

        if (cargasFilialOriginal.length === 0 && selectedFilialForComp !== 'TODAS') {
          setError('Nenhuma carga encontrada para a filial selecionada.');
          setLoadingComp(false);
          return;
        }
        
        const resultados: any[] = [];

        dadosAcumulado.forEach(acum => {
          const docNumRaw = getVal(acum, ['NÚMERO DOCUMENTO', 'ROMANEIO', 'Nº DOCUMENTO', 'Nº DOC', 'DOCUMENTO', 'CÓD. DOCUMENTO', 'COD. DOCUMENTO', 'Cód', 'CÓDIGO', 'COD', 'Nº']) || '-';
          const romaneioAcum = !isNaN(parseInt(docNumRaw, 10)) ? parseInt(docNumRaw, 10) : null;
          
          if (!romaneioAcum) return;

          // Acha a carga correspondente na planilha original (filtrada por filial)
          // Acha a carga correspondente usando Romaneio + Placa para evitar duplicatas erradas
          const placaAcumBusca = String(getVal(acum, ['PLACA DO CAMINHÃO', 'PLACA', 'VEICULO']) || '').trim().toLowerCase();
          const original = cargasFilialOriginal.find(c => 
            c.numeroDocumento === romaneioAcum && 
            (placaAcumBusca === '' || c.placa.toLowerCase().includes(placaAcumBusca) || placaAcumBusca.includes(c.placa.toLowerCase()))
          );

          if (original) {
            const pesoRawAcum = getVal(acum, ['PESO LÍQUIDO C/ DESCONTO (KG)', 'PESO LÍQUIDO (KG)', 'PESO LÍQUIDO', 'PESO LIQUIDO', 'PSP', 'PESO', 'VOLUME', 'TOTAL']);
            let pesoAcum = 0;
            if (typeof pesoRawAcum === 'number') {
               pesoAcum = pesoRawAcum;
            } else if (typeof pesoRawAcum === 'string') {
               const cleanAcum = pesoRawAcum.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
               pesoAcum = parseFloat(cleanAcum) || 0;
            }

            const testeAcum = String(getVal(acum, ['RESULTADO DO TESTE ACOMPANHADO', 'TESTE', 'RESULTADO']) || '').trim();
            const produtorAcum = String(getVal(acum, ['PRODUTOR', 'NOME PRODUTOR', 'CLIENTE', 'NOME DO PRODUTOR']) || 'NÃO INFORMADO').trim();
            const placaAcum = String(getVal(acum, ['PLACA DO CAMINHÃO', 'PLACA', 'VEICULO']) || '-').trim();

            const divProdutor = original.produtor.trim() !== produtorAcum;
            const divPlaca = original.placa.trim() !== placaAcum;
            const divPeso = Math.abs(original.peso - pesoAcum) > 1; // Tolerância de 1kg
            const divTeste = original.resultadoTeste.trim().toLowerCase() !== testeAcum.toLowerCase();

            let status = 'OK';
            if (divProdutor || divPlaca || divPeso || divTeste) {
               if (divProdutor || divPeso) {
                  status = 'POSSÍVEL RATEIO';
               } else {
                  status = 'DIVERGENTE';
               }
            }

            resultados.push({
              romaneio: romaneioAcum,
              status: status,
              original: {
                produtor: original.produtor,
                placa: original.placa,
                peso: original.peso,
                teste: original.resultadoTeste,
                documento: original.documento
              },
              acumulado: {
                produtor: produtorAcum,
                placa: placaAcum,
                peso: pesoAcum,
                teste: testeAcum,
                documento: docNumRaw
              },
              divergencias: {
                produtor: divProdutor,
                placa: divPlaca,
                peso: divPeso,
                teste: divTeste
              }
            });
          } else {
             // Romaneio existe no acumulado mas não na auditoria daquela unidade
             resultados.push({
               romaneio: romaneioAcum,
               status: 'NÃO ENCONTRADO NA AUDITORIA',
               original: null,
               acumulado: {
                  produtor: String(acum['PRODUTOR'] || 'NÃO INFORMADO').trim(),
                  placa: String(acum['PLACA DO CAMINHÃO'] || '-').trim(),
                  peso: typeof acum['PESO LÍQUIDO (KG)'] === 'number' ? acum['PESO LÍQUIDO (KG)'] : parseFloat(acum['PESO LÍQUIDO (KG)'] || 0),
                  teste: String(acum['RESULTADO DO TESTE ACOMPANHADO'] || '').trim(),
                  documento: docNumRaw
               }
             });
          }
        });

        setComparativoResult(resultados);
      } catch (err) {
        console.error(err);
        setError('Erro ao processar comparativo.');
      } finally {
        setLoadingComp(false);
      }
    };

    reader.readAsBinaryString(file);
  };

  const activeData = activeTab === 'produtor' ? [...dataProdutores] : [...dataFiliais];

  if (sortBy === 'volume') {
    activeData.sort((a,b) => b.pesoTotalEntregue - a.pesoTotalEntregue);
  } else if (sortBy === 'positivas') {
    activeData.sort((a,b) => b.testadasPositivas - a.testadasPositivas);
  } else if (sortBy === 'negativas') {
    activeData.sort((a,b) => b.testadasNegativas - a.testadasNegativas);
  } else if (sortBy === 'declaradas') {
    activeData.sort((a,b) => b.declaradas - a.declaradas);
  } else if (sortBy === 'auditado') {
    activeData.sort((a,b) => b.pesoAuditadoTotal - a.pesoAuditadoTotal);
  } else if (sortBy === 'cargas') {
    activeData.sort((a,b) => b.totalCargas - a.totalCargas);
  }

  const filteredData = activeData.filter(d => {
    const term = searchTerm.toLowerCase();
    const cleanTerm = term.replace(/\D/g, '');
    
    const matchName = d.nome.toLowerCase().includes(term);
    const matchCnpj = cleanTerm !== '' && d.cnpj && String(d.cnpj).replace(/\D/g, '').includes(cleanTerm);
    const matchPlaca = d.detalhesCargas.some(c => c.placa && c.placa.toLowerCase().includes(term));
    const matchRomaneio = term !== '' && d.detalhesCargas.some(c => c.documento && String(c.documento).toLowerCase().includes(term));
    
    // NOVO: Busca por itens relacionados (se produtor, busca filial; se filial, busca produtor)
    const matchSubitem = d.subitems.some(s => s.toLowerCase().includes(term));
    
    return matchName || matchCnpj || matchPlaca || matchRomaneio || matchSubitem;
  });

  const globalTotais = dataProdutores.reduce((acc, curr) => ({
    cargas: acc.cargas + curr.totalCargas,
    peso: acc.peso + curr.pesoTotalEntregue,
    declaradas: acc.declaradas + curr.declaradas,
    positivas: acc.positivas + curr.testadasPositivas,
    negativas: acc.negativas + curr.testadasNegativas,
    participantes: acc.participantes + curr.participantes,
    outros: acc.outros + curr.outros,
    pesoAuditado: acc.pesoAuditado + curr.pesoAuditadoTotal,
  }), { cargas: 0, peso: 0, declaradas: 0, positivas: 0, negativas: 0, participantes: 0, outros: 0, pesoAuditado: 0 });

  const renderMiniTable = (cargas: CargaDetalhe[]) => (
    <div className="table-wrapper" >
       <table className="loads-table inline-mini-table">
         <thead>
           <tr>
             <th>Data / Hora</th>
             <th>Responsável (Produtor)</th>
             <th>Filial</th>
             <th>Resultado Teste</th>
             <th>Acompanhamento</th>
             <th>Placa/Doc</th>
           </tr>
         </thead>
         <tbody>
           {cargas.map((carga, i) => (
             <tr key={i}>
               <td>
                 <div className="datetime-cell">
                   <span className="d-date"><Calendar size={12}/> {carga.data}</span>
                   <span className="d-time"><Clock size={12}/> {carga.horario}</span>
                 </div>
               </td>
               <td>
                  <div className="unit-cell text-purple" title={carga.produtor}>
                    <User size={14}/> {carga.produtor.substring(0, 25)}{carga.produtor.length > 25 ? '...' : ''}
                  </div>
               </td>
               <td>
                  <div className="unit-cell" title={carga.unidade}>
                    {renderFilialNameWithCnpj(carga.unidade)}
                  </div>
               </td>
               <td>
                  <span className={`status-badge ${
                     carga.resultadoTeste.toLowerCase().includes('positiva') ? 'bg-green' : 
                     carga.resultadoTeste.toLowerCase().includes('negativa') ? 'bg-red' : 
                     carga.resultadoTeste.toLowerCase().includes('declarada') ? 'bg-gray' : 'bg-blue'
                  }`}>
                    {carga.resultadoTeste}
                  </span>
               </td>
               <td>
                  {carga.naoAcompanhada ? (
                     <span className="acomp-red" title="NÃO ACOMPANHADA">
                       <EyeOff size={14}/> Não
                     </span>
                  ) : (
                     <span className="acomp-green" title="Acompanhada">
                       <Eye size={14}/> Sim
                     </span>
                  )}
               </td>
               <td>
                 <div className="plate-cell">
                    <div className="doc-num">{carga.documento}</div>
                    <div className="plate-num">{carga.placa}</div>
                 </div>
               </td>
             </tr>
           ))}
         </tbody>
       </table>
    </div>
  );



  return (
    <div className="container">
      <header className="header">
        <div className="gradient-badge">Painel de Segurança e Qualidade</div>
        <h1>Análise Integrada de Cargas</h1>
        <p>Visão de segurança corporativa cruzando dados em tempo real para detectar quebras operacionais.</p>
      </header>
      
      {(!dataProdutores.length && !dataFiliais.length) && (
        <div className="upload-section">
          <label className="upload-box glass-panel">
            <UploadCloud size={48} className="upload-icon" />
            <div className="upload-text">
              <span className="upload-title">{loading ? 'Gerando inteligência sobre as cargas...' : 'Importar Planilha de Cargas'}</span>
              <span className="upload-subtitle">Arraste e solte o relatorio_acompanhamento_cargas.xlsx aqui</span>
            </div>
            <input type="file" accept=".xlsx, .xls" onChange={handleFileUpload} disabled={loading} className="hidden-input"/>
          </label>
          {error && <div className="error-msg"><AlertCircle size={20}/> {error}</div>}
        </div>
      )}

      {(dataProdutores.length > 0 || dataFiliais.length > 0) && (
        <div className="dashboard">
          
          <div className="tabs-container">
            <button 
               className={`tab-btn ${activeTab === 'filial' ? 'active' : ''}`}
               onClick={() => { setActiveTab('filial'); setSearchTerm(''); }}
            >
              <Building2 size={18}/> Visão Filiais
            </button>
            <button 
               className={`tab-btn ${activeTab === 'produtor' ? 'active' : ''}`}
               onClick={() => { setActiveTab('produtor'); setSearchTerm(''); }}
            >
              <User size={18}/> Visão Produtores
            </button>
            <button 
               className={`tab-btn crit-btn ${activeTab === 'auditoria' ? 'active-crt' : ''}`}
               onClick={() => { setActiveTab('auditoria'); setSearchTerm(''); }}
            >
              <ShieldAlert size={18} className={alertasCriticos.length > 0 ? "pulse-icon" : ""}/> 
              Auditoria de Divergências 
              {alertasCriticos.length > 0 && <span className="crit-badge">{alertasCriticos.length}</span>}
            </button>
            <button 
               className={`tab-btn ${activeTab === 'comparativo' ? 'active' : ''}`}
               onClick={() => { setActiveTab('comparativo'); setSearchTerm(''); }}
            >
              <ArrowLeftRight size={18}/> 
              Comparativo Acumulado
            </button>
          </div>

          <div className="dashboard-header glass-panel">
             {activeTab === 'auditoria' && (
                <div className="auditoria-header">
                   <h2>Painel de Auditoria Investigativa</h2>
                   <p>Aqui o algoritmo cruza quebras de rotina, rastreio de placas e furos de documentos em um espaço contínuo para apontar desvios operacionais ou divergências de testagem.</p>
                     <button className="btn-outline crt-reset" onClick={() => { setDataProdutores([]); setDataFiliais([]); setSearchTerm(''); }}>
                       Analisar Outra Planilha
                     </button>
                  </div>
              )}

              {activeTab === 'comparativo' && (
                 <div className="auditoria-header">
                    <h2>Comparativo de Planilhas (Auditado vs Acumulado)</h2>
                    <p>Batimento automático de cargas para identificação visual de erros entre visitas e consolidado.</p>
                 </div>
              )}
             


             {(activeTab === 'produtor' || activeTab === 'filial') && (
                <>
                  <div className="summary-stats">
                    <div className="stat-item">
                      <Truck className="stat-icon text-blue" />
                      <div className="stat-info">
                        <span className="stat-label">Cargas</span>
                        <span className="stat-value">{formatNumber(globalTotais.cargas)}</span>
                      </div>
                    </div>
                    <div className="stat-item">
                      <Scale className="stat-icon text-purple" />
                      <div className="stat-info">
                        <span className="stat-label">Volume (KG)</span>
                        <span className="stat-value">{formatNumber(globalTotais.peso)} <small>kg</small></span>
                      </div>
                    </div>
                    <div className="stat-item">
                      <FileSpreadsheet className="stat-icon text-gray" />
                      <div className="stat-info">
                        <span className="stat-label">Declaradas</span>
                        <span className="stat-value">{formatNumber(globalTotais.declaradas)}</span>
                      </div>
                    </div>
                    <div className="stat-item">
                      <Users className="stat-icon text-cyan" />
                      <div className="stat-info">
                        <span className="stat-label">Participantes</span>
                        <span className="stat-value">{formatNumber(globalTotais.participantes)}</span>
                      </div>
                    </div>
                    <div className="stat-item">
                      <AlertTriangle className="stat-icon text-red" />
                      <div className="stat-info">
                        <span className="stat-label">Negativas</span>
                        <span className="stat-value text-red">{formatNumber(globalTotais.negativas)}</span>
                      </div>
                    </div>
                    <div className="stat-item">
                      <CheckCircle className="stat-icon text-green" />
                      <div className="stat-info">
                        <span className="stat-label">Positivas</span>
                        <span className="stat-value text-green">{formatNumber(globalTotais.positivas)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="toolbar">
                    <div className="search-bar">
                      {activeTab === 'produtor' ? <User size={18} className="search-icon" /> : <Building2 size={18} className="search-icon" />}
                      <input 
                        type="text" 
                        placeholder={`Pesquisar Nome, Placa, Romaneio ou CPF/CNPJ de ${activeTab === 'produtor' ? 'produtor' : 'filial'}...`}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                    </div>
                    <div className="filter-group">
                      <select title="Filtrar" className="filter-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                         <option value="padrao">Padrão Original (Sem Filtro)</option>
                         <option value="volume">Maior Volume (Kg)</option>
                         <option value="positivas">Mais Cargas Positivas</option>
                         <option value="negativas">Mais Cargas Negativas</option>
                         <option value="declaradas">Mais Declaradas (Cegas)</option>
                         <option value="auditado">Maior Volume Auditado</option>
                         <option value="cargas">Maior Lotações Totais</option>
                      </select>
                      {(searchTerm !== '' || sortBy !== 'padrao') && (
                        <button className="btn-outline clear-filter-btn" onClick={() => { setSearchTerm(''); setSortBy('padrao'); }}>
                          <X size={16} className="x-icon-clear"/>
                          Limpar
                        </button>
                      )}
                      <button className="btn-outline" onClick={() => { setDataProdutores([]); setDataFiliais([]); setSearchTerm(''); setSortBy('padrao'); }}>
                        Subir Outra
                      </button>
                    </div>
                  </div>
                </>
             )}
          </div>

          {(activeTab === 'produtor' || activeTab === 'filial') && (
            <div className="cards-grid">
              {filteredData.map((entity, idx) => {
                const hasAlert = entity.testadasNegativas > 0 && (entity.testadasPositivas > 0 || entity.declaradas > 0);
                const totalMapeadas = entity.testadasPositivas + entity.testadasNegativas + entity.declaradas;

                return (
                  <div 
                    key={idx} 
                    className={`card glass-panel clickable-card ${hasAlert && totalMapeadas > 0 && activeTab === 'produtor' ? 'card-alert-red' : ''}`}
                    onClick={() => setSelectedEntity({ ...entity })}
                  >
                    <div className="card-header">
                      <div className="produtor-info">
                        <div className="avatar">
                          {activeTab === 'produtor' ? <User size={20} /> : <Building2 size={20} />}
                        </div>
                        <h3>
                            {entity.nome.split(' (')[0]}
                            {entity.cnpj && activeTab === 'filial' && <div className="cnpj-badge"><Hash size={10}/> {entity.cnpj}</div>}
                        </h3>
                      </div>
                      <div className="unidades-tags">
                        {entity.subitems.slice(0, 2).map((item, i) => (
                          <span 
                            key={i} 
                            className={`tag-unidade ${activeTab === 'filial' ? 'clickable-link' : ''}`}
                            title={item}
                            onClick={(e) => {
                               if (activeTab === 'filial') {
                                  e.stopPropagation();
                                  const prodReferencia = dataProdutores.find(p => p.nome === item);
                                  if (prodReferencia) {
                                     setActiveTab('produtor');
                                     setSelectedEntity(prodReferencia);
                                  }
                               }
                            }}
                          >
                            {activeTab === 'produtor' ? <MapPin size={12}/> : <User size={12}/>} 
                            {item.split(' ').slice(0, 2).join(' ')}
                          </span>
                        ))}
                        {entity.subitems.length > 2 && <span className="tag-unidade tag-more">+{entity.subitems.length - 2}</span>}
                      </div>
                    </div>
                    
                    <div className="card-body">
                      <div className="volume-display">
                        <div className="vol-item">
                          <span className="vol-label">Cargas (Qtd)</span>
                          <span className="vol-val">{formatNumber(entity.totalCargas)}</span>
                        </div>
                        <div className="vol-divider"></div>
                        <div className="vol-item">
                          <span className="vol-label">Peso Entregue</span>
                          <span className="vol-val highlight">{formatNumber(entity.pesoTotalEntregue)} <small>kg</small></span>
                        </div>
                        <div className="vol-divider"></div>
                        <div className="vol-item">
                          <span className="vol-label">Peso Auditado</span>
                          <span className="vol-val text-cyan">{formatNumber(entity.pesoAuditadoTotal)} <small>kg</small></span>
                        </div>
                        {entity.pesoAuditadoTotal > 0 && Math.abs(entity.pesoTotalEntregue - entity.pesoAuditadoTotal) > 1 && (
                          <>
                            <div className="vol-divider"></div>
                            <div className="vol-item">
                              <span className="vol-label">Diferença</span>
                              <span className={`vol-val ${entity.pesoTotalEntregue > entity.pesoAuditadoTotal ? 'text-red' : 'text-green'}`}>
                                {formatNumber(entity.pesoTotalEntregue - entity.pesoAuditadoTotal)} <small>kg</small>
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                      
                      {entity.horarioPico !== 'N/D' && (
                         <div className="pico-alert">
                             <Clock size={16} className="text-orange" />
                             <strong>Horário de Pico:</strong> {entity.horarioPico}
                         </div>
                      )}

                      <div className="results-breakdown dynamic-grid">
                        <div className="result-pill gray">
                          <span className="r-label">Declarada</span>
                          <span className="r-val flex-column-center">
                             {formatNumber(entity.pesoDeclaradas)} kg
                             <small className="peso-small">({entity.declaradas} un)</small>
                          </span>
                        </div>
                        {(entity.participantes > 0 || globalTotais.participantes > 0) && (
                          <div className="result-pill blue">
                            <span className="r-label">Participante</span>
                            <span className="r-val">{entity.participantes}</span>
                          </div>
                        )}
                        <div className="result-pill red">
                          <span className="r-label">Negativas</span>
                          <span className="r-val flex-column-center">
                             {formatNumber(entity.pesoNegativas)} kg
                             <small className="peso-small">({entity.testadasNegativas} un)</small>
                          </span>
                        </div>
                        <div className="result-pill green">
                          <span className="r-label">Positivas</span>
                          <span className="r-val flex-column-center">
                             {formatNumber(entity.pesoPositivas)} kg
                             <small className="peso-small">({entity.testadasPositivas} un)</small>
                          </span>
                        </div>
                      </div>
                      
                      {entity.outros > 0 && (
                        <div className="result-extras">
                          <span className="extra-label">Outros Sem Teste/Nulo:</span>
                          <span className="extra-val">{entity.outros}</span>
                        </div>
                      )}
                      <button className="view-details-btn">
                        Ver Extrato de Cargas
                      </button>
                    </div>
                  </div>
                );
              })}
              
              {filteredData.length === 0 && (
                <div className="empty-search">Nenhum dado encontrado para a sua busca nesta visão.</div>
              )}
            </div>
          )}



          {activeTab === 'auditoria' && (
             <div className="auditoria-panel">
               {alertasCriticos.length === 0 ? (
                 <div className="alertas-empty">
                   <ShieldAlert size={48} className="text-green"/>
                   <h2>Nenhuma anomalia detectada</h2>
                   <p>Todas as placas e cadernetas de documento conferidas pelo sistema estão dentro dos padrões normais. Nada cruzou como divergência crítica até agora.</p>
                 </div>
               ) : (
                 <div className="alertas-list">
                    {alertasCriticos.map((alerta, j) => (
                       <div key={j} className={`alerta-box glass-panel ${alerta.nivel === 'CRITICO' ? 'alerta-red' : 'alerta-orange'}`}>
                          <div className="al-header">
                             {alerta.nivel === 'CRITICO' ? <ShieldAlert size={28} className="al-icon-red"/> : <AlertTriangle size={28} className="al-icon-orange"/>}
                             <h3>{alerta.titulo}</h3>
                          </div>
                          <div className="al-body">
                             <p>{alerta.descricao}</p>
                             {alerta.cargasEnvolvidas && alerta.cargasEnvolvidas.length > 0 && renderMiniTable(alerta.cargasEnvolvidas)}
                          </div>
                       </div>
                    ))}
                 </div>
               )}
             </div>
          )}

          {activeTab === 'comparativo' && (
              <div className="comparativo-panel glass-panel">
                 <div className="comp-top-bar">
                    <div className="comp-title-area">
                       <h3>Conferência Cruzada de Romaneios</h3>
                       <p>Realize o batimento automático entre os dados da sua inspeção e o consolidado corporativo.</p>
                    </div>

                    <div className="comp-controls">
                       <div className="control-item">
                          <label>1. Unidade de Referência</label>
                          <div className="search-select-container">
                             <div className="search-pill">
                                <Search size={14} className="text-gray"/>
                                <input 
                                   type="text"
                                   className="search-input-clean"
                                   placeholder="Pesquisar unidade..."
                                   value={compFilialSearch}
                                   onChange={(e) => setCompFilialSearch(e.target.value)}
                                />
                             </div>
                             <select 
                                className="filter-select select-integrated" 
                                value={selectedFilialForComp} 
                                title="Selecione a unidade para comparação"
                                onChange={(e) => setSelectedFilialForComp(e.target.value)}
                             >
                                <option value="">{compFilialSearch ? '--- Resultados da Busca ---' : 'Selecione a unidade...'}</option>
                                <option value="TODAS">⭐ TODAS AS UNIDADES (AUDITORIA GLOBAL)</option>
                                {dataFiliais
                                   .filter(f => f.nome.toLowerCase().includes(compFilialSearch.toLowerCase()))
                                   .map((f, i) => (
                                   <option key={i} value={f.nome}>{f.nome}</option>
                                ))}
                             </select>
                          </div>
                       </div>

                       <div className="control-item">
                          <label>2. Próxima Etapa</label>
                          <label className={`upload-mini ${!selectedFilialForComp ? 'disabled-upload' : ''}`}>
                             <UploadCloud size={20}/> 
                             {loadingComp ? 'Processando dados...' : 'Carregar Planilha Acumulado'}
                             <input 
                                type="file" 
                                accept=".xlsx, .xls" 
                                onChange={handleComparativoUpload} 
                                disabled={!selectedFilialForComp || loadingComp} 
                                style={{ display: 'none' }}
                             />
                          </label>
                       </div>
                    </div>
                 </div>

                 {comparativoResult.length > 0 && (
                    <>
                       <div className="comp-summary-cards">
                          <div className={`c-stat-card blue clickable ${filterStatusComp === 'TUDO' ? 'active-filter' : ''}`} onClick={() => setFilterStatusComp('TUDO')}>
                             <div className="cs-icon blue"><Hash size={20}/></div>
                             <div className="cs-info">
                                <span className="cs-label">Analisados</span>
                                <span className="cs-val">{comparativoResult.length}</span>
                             </div>
                          </div>
                          <div className={`c-stat-card green clickable ${filterStatusComp === 'OK' ? 'active-filter' : ''}`} onClick={() => setFilterStatusComp('OK')}>
                             <div className="cs-icon green"><CheckCircle size={20}/></div>
                             <div className="cs-info">
                                <span className="cs-label">Conformes</span>
                                <span className="cs-val">{comparativoResult.filter(r => r.status === 'OK').length}</span>
                             </div>
                          </div>
                          <div className={`c-stat-card red clickable ${filterStatusComp === 'DIVERGENTE' ? 'active-filter' : ''}`} onClick={() => setFilterStatusComp('DIVERGENTE')}>
                             <div className="cs-icon red"><AlertCircle size={20}/></div>
                             <div className="cs-info">
                                <span className="cs-label">Divergentes</span>
                                <span className="cs-val">{comparativoResult.filter(r => r.status === 'DIVERGENTE').length}</span>
                             </div>
                          </div>
                          <div className={`c-stat-card yellow clickable ${filterStatusComp === 'RATEIO' ? 'active-filter' : ''}`} onClick={() => setFilterStatusComp('RATEIO')}>
                             <div className="cs-icon yellow"><Scale size={20}/></div>
                             <div className="cs-info">
                                <span className="cs-label">Possíveis Rateios</span>
                                <span className="cs-val">{comparativoResult.filter(r => r.status === 'POSSÍVEL RATEIO').length}</span>
                             </div>
                          </div>
                          <div className={`c-stat-card orange clickable ${filterStatusComp === 'INCONSISTENTE' ? 'active-filter' : ''}`} onClick={() => setFilterStatusComp('INCONSISTENTE')}>
                             <div className="cs-icon orange"><HelpCircle size={20}/></div>
                             <div className="cs-info">
                                <span className="cs-label">Inconsistentes</span>
                                <span className="cs-val">{comparativoResult.filter(r => r.status.includes('NÃO ENCONTRADO')).length}</span>
                             </div>
                          </div>
                       </div>

                       <div className="comp-table-container">
                          <div className="results-header-with-search">
                             <div className="results-title">
                                <h3>Resultados da Auditoria</h3>
                                <button className="btn-text" onClick={() => setComparativoResult([])}>Recomeçar</button>
                             </div>
                             
                             <div className="table-search-box">
                                <input 
                                   type="text" 
                                   placeholder="🔍 Filtrar por Produtor, CPF, Placa ou Romaneio..." 
                                   value={searchTermResultsComp}
                                   onChange={(e) => setSearchTermResultsComp(e.target.value)}
                                />
                             </div>
                          </div>

                          <div className="table-wrapper">
                             <table className="loads-table comp-table">
                                <thead>
                                   <tr>
                                      <th style={{ width: '120px' }}>Documento</th>
                                      <th style={{ width: '150px' }}>Status de Conferência</th>
                                      <th>Confronto de Dados (Auditado vs Acumulado)</th>
                                      <th style={{ width: '200px' }}>Divergências</th>
                                   </tr>
                                </thead>
                                <tbody>
                                   {comparativoResult
                                      .filter(r => {
                                         const currentFilter = filterStatusComp as string;
                                         if (currentFilter === 'OK') return r.status === 'OK';
                                         if (currentFilter === 'DIVERGENTE') return r.status === 'DIVERGENTE';
                                         if (currentFilter === 'RATEIO') return r.status === 'POSSÍVEL RATEIO';
                                         if (currentFilter === 'INCONSISTENTE') return r.status.includes('NÃO ENCONTRADO');
                                         return true;
                                      })
                                      .filter(r => {
                                         const t = searchTermResultsComp.toLowerCase();
                                         const romaneioStr = String(r.romaneio).toLowerCase();
                                         const prodOriginal = (r.original?.produtor || '').toLowerCase();
                                         const prodAcum = (r.acumulado?.produtor || '').toLowerCase();
                                         const placaOriginal = (r.original?.placa || '').toLowerCase();
                                         const placaAcum = (r.acumulado?.placa || '').toLowerCase();
                                         const cnpj = (r.original?.cnpj || '').toLowerCase();
                                         
                                         return romaneioStr.includes(t) || 
                                                prodOriginal.includes(t) || 
                                                prodAcum.includes(t) || 
                                                placaOriginal.includes(t) || 
                                                placaAcum.includes(t) ||
                                                cnpj.includes(t);
                                      })
                                      .map((res, i) => (
                                      <tr key={i} className={res.status === 'OK' ? '' : 'divergence-row'}>
                                         <td><strong>#{res.romaneio}</strong></td>
                                         <td>
                                            <span className={`status-badge ${res.status === 'OK' ? 'bg-green' : res.status === 'POSSÍVEL RATEIO' ? 'bg-yellow' : res.status === 'DIVERGENTE' ? 'bg-red' : 'bg-gray'}`}>
                                               {res.status}
                                            </span>
                                         </td>
                                         <td>
                                            <div className="comp-diff-grid">
                                               {/* ORIGEM */}
                                               <div className="comp-side-group">
                                                  {[
                                                     {label: 'Romaneio', val: res.original?.documento || 'Ausente', icon: Hash},
                                                     {label: 'Produtor', val: res.original?.produtor || 'Ausente', div: res.divergencias?.produtor, icon: User},
                                                     {label: 'Placa', val: res.original?.placa || 'Ausente', div: res.divergencias?.placa, icon: Truck},
                                                     {label: 'Peso', val: res.original ? `${formatNumber(res.original.peso)} kg` : '0', div: res.divergencias?.peso, icon: Scale},
                                                     {label: 'Teste', val: res.original?.teste || 'Ausente', div: res.divergencias?.teste, icon: FileCode}
                                                  ].map((f, idx) => (
                                                     <div key={idx} className={`comp-side ${f.div ? 'divergent-field' : ''}`}>
                                                        <span className="side-label">{f.label} (Auditado)</span>
                                                        <div className="side-data"><f.icon size={14}/> {f.val}</div>
                                                     </div>
                                                  ))}
                                               </div>

                                               <ArrowLeftRight size={24} className="comp-arrow-sep" />

                                               {/* ACUMULADO */}
                                               <div className="comp-side-group">
                                                  {[
                                                     {label: 'Romaneio', val: res.acumulado.documento || 'Vazio', icon: Hash},
                                                     {label: 'Produtor', val: res.acumulado.produtor || 'Vazio', div: res.divergencias?.produtor, icon: User},
                                                     {label: 'Placa', val: res.acumulado.placa || 'Vazio', div: res.divergencias?.placa, icon: Truck},
                                                     {label: 'Peso', val: `${formatNumber(res.acumulado.weight || res.acumulado.peso)} kg`, div: res.divergencias?.peso, icon: Scale},
                                                     {label: 'Teste', val: res.acumulado.teste || 'Não Inf.', div: res.divergencias?.teste, icon: FileCode}
                                                  ].map((f, idx) => (
                                                     <div key={idx} className={`comp-side ${f.div ? 'divergent-field' : ''}`}>
                                                        <span className="side-label">{f.label} (Acumulado)</span>
                                                        <div className={`side-data ${f.div ? 'text-red font-bold' : ''}`}><f.icon size={14}/> {f.val}</div>
                                                     </div>
                                                  ))}
                                               </div>
                                            </div>
                                         </td>
                                         <td>
                                            <div className="div-summary">
                                               {res.status === 'OK' ? (
                                                  <span className="text-green flex-center gap-2"><CheckCircle size={16}/> Conformidade Total</span>
                                               ) : (
                                                  <>
                                                     {res.divergencias?.produtor && <span className="div-chip"><User size={12}/> Nome Produtor</span>}
                                                     {res.divergencias?.placa && <span className="div-chip"><Truck size={12}/> Placa Veículo</span>}
                                                     {res.divergencias?.peso && <span className="div-chip"><Scale size={12}/> Diferença Peso</span>}
                                                     {res.divergencias?.teste && <span className="div-chip"><FileCode size={12}/> Resultado Teste</span>}
                                                     {res.status === 'NÃO ENCONTRADO NA AUDITORIA' && <span className="div-chip"><AlertTriangle size={12}/> Romaneio Externo</span>}
                                                  </>
                                               )}
                                            </div>
                                         </td>
                                      </tr>
                                   ))}
                                </tbody>
                             </table>
                          </div>
                       </div>
                    </>
                 )}

                 {comparativoResult.length === 0 && !loadingComp && (
                    <div className="comp-empty">
                       <div className="empty-icon-wrapper">
                          <ArrowLeftRight size={64} className="text-blue opacity-20"/>
                       </div>
                       <p>Aguardando seleção de unidade e carga de arquivo de acumulado para processar batimento de romaneios.</p>
                    </div>
                 )}
              </div>
          )}

        </div>
      )}

      {/* Modal de Detalhes da Entidade */}
      {selectedEntity && (
        <div className="modal-overlay" onClick={() => setSelectedEntity(null)}>
          <div className="modal-content glass-panel" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">
                <h2 className="h2-modal-title">
                   {selectedEntity.nome.split(' (')[0]} 
                   {selectedEntity.cnpj && <span className="cnpj-modal-badge">CNPJ: {selectedEntity.cnpj}</span>}
                </h2>
                <span>Extrato detalhado de cargas ({selectedEntity.cnpj ? 'Visão Filial PDR' : 'Visão Produtor'})</span>
              </div>
              <button className="close-btn" title="Fechar extrato" onClick={() => setSelectedEntity(null)}>
                <X size={24} />
              </button>
            </div>
            
            <div className="modal-body">
              <div className="modal-stats glass-panel">
                 <div className="m-stat"><Scale size={18}/> <strong>Volume:</strong> {formatNumber(selectedEntity.pesoTotalEntregue)} kg</div>
                 <div className="m-stat"><ShieldAlert size={18}/> <strong>Auditado:</strong> {formatNumber(selectedEntity.pesoAuditadoTotal)} kg</div>
                 <div className="m-stat"><Truck size={18}/> <strong>Lotações:</strong> {selectedEntity.totalCargas}</div>
                 <div className="m-stat m-stat-pico"><Clock size={18}/> <strong>Pico Local:</strong> {selectedEntity.horarioPico}</div>
              </div>
              
              <div className="table-wrapper">
                <table className="loads-table">
                  <thead>
                    <tr>
                      <th>Data / Hora</th>
                      <th>{selectedEntity.cnpj ? 'Responsável (Produtor)' : 'Onde Entregou (Filial)'}</th>
                      <th>Resultado Teste</th>
                      <th>Acompanhamento</th>
                      <th>Auditor (Cod)</th>
                      <th>Cód Romaneio/Placa</th>
                      <th className="align-right">Peso (KG)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedEntity.detalhesCargas.sort((a,b) => b.timestamp - a.timestamp).map((carga, i) => (
                      <tr key={i}>
                        <td>
                          <div className="datetime-cell">
                            <span className="d-date"><Calendar size={12}/> {carga.data}</span>
                            <span className="d-time"><Clock size={12}/> {carga.horario}</span>
                          </div>
                        </td>
                        <td>
                          {!selectedEntity.cnpj ? (
                            <div className="unit-cell" title={carga.unidade}>
                              {renderFilialNameWithCnpj(carga.unidade)}
                            </div>
                          ) : (
                            <div 
                               className="unit-cell text-purple clickable-link" 
                               title={`Ver extrato completo do produtor: ${carga.produtor}`}
                               onClick={(e) => {
                                  e.stopPropagation();
                                  const prodReferencia = dataProdutores.find(p => p.nome === carga.produtor);
                                  if (prodReferencia) {
                                      setActiveTab('produtor');
                                      setSelectedEntity(prodReferencia);
                                  }
                               }}
                            >
                              <User size={14}/> {carga.produtor.substring(0, 35)}{carga.produtor.length > 35 ? '...' : ''}
                            </div>
                          )}
                        </td>
                        <td>
                           <span className={`status-badge ${
                              carga.resultadoTeste.toLowerCase().includes('positiva') ? 'bg-green' : 
                              carga.resultadoTeste.toLowerCase().includes('negativa') ? 'bg-red' : 
                              carga.resultadoTeste.toLowerCase().includes('declarada') ? 'bg-gray' : 'bg-blue'
                           }`}>
                             {carga.resultadoTeste}
                           </span>
                        </td>
                        <td>
                           {carga.naoAcompanhada ? (
                              <span className="acomp-red" title="Carga marcada como NÃO ACOMPANHADA">
                                <EyeOff size={14}/> Não Acomp.
                              </span>
                           ) : (
                              <span className="acomp-green" title="Carga Acompanhada pelo Conferente / Normal">
                                <Eye size={14}/> Acompanhada
                              </span>
                           )}
                        </td>
                        <td>
                          <span className="auditor-cell"><ClipboardType size={14}/> {carga.auditor}</span>
                        </td>
                        <td>
                          <div className="plate-cell plate-cell-col">
                             <div className="doc-num doc-bold">{carga.documento}</div>
                             <div className="plate-num plate-small">{carga.placa}</div>
                          </div>
                        </td>
                        <td className="align-right peso-cell">
                          {formatNumber(carga.peso)}<small>kg</small>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}


    </div>
  );
}

export default App;

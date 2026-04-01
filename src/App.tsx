import { useState } from 'react';
import * as xlsx from 'xlsx';

import { UploadCloud, CheckCircle, AlertCircle, AlertTriangle, Truck, MapPin, Scale, User, FileSpreadsheet, Users, X, Calendar, Clock, ClipboardType, Building2, EyeOff, Eye, ShieldAlert, Hash } from 'lucide-react';
import './App.css';

interface CargaDetalhe {
  id: string;
  data: string;
  horario: string;
  timestamp: number;
  peso: number;
  unidade: string;
  resultadoTeste: string;
  documento: string;
  numeroDocumento: number | null; 
  auditor: string;
  placa: string;
  produtor: string;
  cnpj: string;
  naoAcompanhada: boolean;
  divergencia?: string;
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

function App() {
  const [dataProdutores, setDataProdutores] = useState<EntityData[]>([]);
  const [dataFiliais, setDataFiliais] = useState<EntityData[]>([]);
  const [alertasCriticos, setAlertasCriticos] = useState<AlertaCritico[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('padrao');
  
  const [activeTab, setActiveTab] = useState<'produtor' | 'filial' | 'auditoria'>('filial');
  const [selectedEntity, setSelectedEntity] = useState<EntityData | null>(null);

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

        const headers: string[] = rawData[1] || [];
        const rows = rawData.slice(2);

        const dadosCargas = rows.map(row => {
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
          let nomeProdutor = carga['PRODUTOR'];
          if (!nomeProdutor || String(nomeProdutor).trim() === '') nomeProdutor = 'NÃO INFORMADO';

          const nomeBaseFilial = carga['RAZÃO SOCIAL FILIAL PDR'] || carga['CIDADE FILIAL'] || 'UNIDADE DESCONHECIDA';
          const cnpjBaseFilial = carga['CNPJ FILIAL PDR'] || carga['CNPJ'] || '';
          
          let keyFilial = cnpjBaseFilial ? `${nomeBaseFilial}|${cnpjBaseFilial}` : `${nomeBaseFilial}|S/N`;
          let displayFilial = cnpjBaseFilial ? `${nomeBaseFilial} (${cnpjBaseFilial})` : nomeBaseFilial;

          const pesoStr = carga['PESO LÍQUIDO (KG)'];
          let peso = 0;
          if (typeof pesoStr === 'number') peso = pesoStr;
          else if (typeof pesoStr === 'string' && !isNaN(parseFloat(pesoStr))) peso = parseFloat(pesoStr);

          const resultadoTesteOriginal = String(carga['RESULTADO DO TESTE ACOMPANHADO'] || '').trim();
          const resultadoTeste = resultadoTesteOriginal.toLowerCase();
          const naoAcompFlag = String(carga['NÃO ACOMPANHADA']).trim().toLowerCase() === 'sim';
          
          const dt = carga['DATA'] || '';
          const hr = carga['HORÁRIO'] || '';
          const ts = parseDataHora(dt, hr);
          
          let hrNum = -1;
          if (hr && hr.includes(':')) {
             hrNum = parseInt(hr.split(':')[0], 10);
          }

          if (!pMap[nomeProdutor]) pMap[nomeProdutor] = { nome: nomeProdutor, cnpj: '', subitems: [], totalCargas: 0, pesoTotalEntregue: 0, declaradas: 0, testadasPositivas: 0, testadasNegativas: 0, pesoDeclaradas: 0, pesoPositivas: 0, pesoNegativas: 0, participantes: 0, outros: 0, detalhesCargas: [], horasCount: {}, horarioPico: '' };
          if (!fMap[keyFilial]) fMap[keyFilial] = { nome: displayFilial, cnpj: cnpjBaseFilial, subitems: [], totalCargas: 0, pesoTotalEntregue: 0, declaradas: 0, testadasPositivas: 0, testadasNegativas: 0, pesoDeclaradas: 0, pesoPositivas: 0, pesoNegativas: 0, participantes: 0, outros: 0, detalhesCargas: [], horasCount: {}, horarioPico: '' };

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

          // Tenta capturar o número do romaneio através de diversas nomenclaturas que a filial possa usar
          const docNumRaw = carga['NÚMERO DOCUMENTO'] || carga['Nº DOC'] || carga['Cód'] || carga['CÓDIGO'] || carga['COD'] || carga['ROMANEIO'] || carga['TIPO DOCUMENTO'] || '-';
          const docNumParsed = !isNaN(parseInt(docNumRaw, 10)) ? parseInt(docNumRaw, 10) : null;

          const detalhe: CargaDetalhe = {
             id: carga['ID'] || `S/ID-${p.totalCargas}`,
             data: dt || 'N/D',
             horario: hr || 'N/D',
             timestamp: ts,
             peso: peso,
             unidade: displayFilial,
             resultadoTeste: resultadoTesteOriginal || 'Sem Teste',
             documento: docNumRaw,
             numeroDocumento: docNumParsed,
             auditor: carga['CÓDIGO VISITA'] || carga['EMPRESA HARVEST'] || 'Indisponível',
             placa: carga['PLACA DO CAMINHÃO'] || '-',
             produtor: nomeProdutor,
             cnpj: String(carga['CPF'] || carga['CNPJ'] || carga['CPF PRODUTOR'] || carga['CPF DO PRODUTOR'] || carga['CPF\/CNPJ'] || '').trim(),
             naoAcompanhada: naoAcompFlag
          };
          
          p.detalhesCargas.push(detalhe);
          f.detalhesCargas.push(detalhe);
          globalCargasPool.push(detalhe);

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

  const activeData = activeTab === 'produtor' ? [...dataProdutores] : [...dataFiliais];

  if (sortBy === 'volume') {
    activeData.sort((a,b) => b.pesoTotalEntregue - a.pesoTotalEntregue);
  } else if (sortBy === 'positivas') {
    activeData.sort((a,b) => b.testadasPositivas - a.testadasPositivas);
  } else if (sortBy === 'negativas') {
    activeData.sort((a,b) => b.testadasNegativas - a.testadasNegativas);
  } else if (sortBy === 'declaradas') {
    activeData.sort((a,b) => b.declaradas - a.declaradas);
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
    return matchName || matchCnpj || matchPlaca || matchRomaneio;
  });

  const globalTotais = dataProdutores.reduce((acc, curr) => ({
    cargas: acc.cargas + curr.totalCargas,
    peso: acc.peso + curr.pesoTotalEntregue,
    declaradas: acc.declaradas + curr.declaradas,
    positivas: acc.positivas + curr.testadasPositivas,
    negativas: acc.negativas + curr.testadasNegativas,
    participantes: acc.participantes + curr.participantes,
    outros: acc.outros + curr.outros,
  }), { cargas: 0, peso: 0, declaradas: 0, positivas: 0, negativas: 0, participantes: 0, outros: 0 });

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

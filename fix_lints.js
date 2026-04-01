import fs from 'fs';

let css = fs.readFileSync('src/App.css', 'utf-8');
const newClasses = `
/* Additional Utility Classes to resolve inline style lints */
.clear-filter-btn { color: #dc2626 !important; border-color: #fecaca !important; background: #fef2f2 !important; }
.x-icon-clear { margin-bottom: -3px; margin-right: 4px; }
.cnpj-badge { font-size: 0.75rem; font-weight: 400; color: var(--text-secondary); margin-top: 4px; }
.pico-alert { display: flex; align-items: center; gap: 0.5rem; background: #fffbeb; padding: 0.5rem 0.75rem; border-radius: 0.5rem; font-size: 0.85rem; color: #92400e; border: 1px solid #fde68a; font-weight: 600; }
.flex-column-start { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; }
.peso-small { font-weight: normal; opacity: 0.8; }
.add-pdf-container { margin-top: 0.75rem; }
.add-pdf-label { display: flex; justify-content: center; align-items: center; cursor: pointer; padding: 0.6rem; background: #f8fafc; border: 1px dashed #cbd5e1; color: #475569; font-size: 0.8rem; font-weight: 600; border-radius: 6px; }
.d-none { display: none; }
.plate-cell-col { display: flex; flex-direction: column; }
.doc-bold { font-weight: bold; }
.plate-small { font-size: 0.8rem; color: #64748b; }
.divergence-alert { font-size: 0.75rem; font-weight: 600; color: #b91c1c; margin-top: 4px; }
.romaneio-bold { font-weight: 600; color: #334155; }
.empty-table-msg { text-align: center; padding: 2rem; color: #64748b; }
.divergence-row { background-color: #fee2e2; color: #991b1b; }
.table-wrapper { margin-top: 1.25rem; }
`;
if(!css.includes('clear-filter-btn')) {
    fs.appendFileSync('src/App.css', newClasses);
}

let appTsx = fs.readFileSync('src/App.tsx', 'utf-8');

appTsx = appTsx.replace(/style=\{\{ marginTop: '1.25rem' \}\}/g, '');
appTsx = appTsx.replace(/<div className="table-wrapper">/g, '<div className="table-wrapper">');

appTsx = appTsx.replace(/style=\{\{ color: '#dc2626', borderColor: '#fecaca', background: '#fef2f2' \}\}/g, 'className="clear-filter-btn"');
appTsx = appTsx.replace(/style=\{\{ marginBottom: '-3px', marginRight: '4px' \}\}/g, 'className="x-icon-clear"');
appTsx = appTsx.replace(/style=\{\{ '--stagger': idx \} as React\.CSSProperties\}/g, '');
appTsx = appTsx.replace(/style=\{\{fontSize: '0\.75rem', fontWeight: 400, color: 'var\(--text-secondary\)', marginTop: '4px'\}\}/g, 'className="cnpj-badge"');
appTsx = appTsx.replace(/style=\{\{ display: 'flex', alignItems: 'center', gap: '0\.5rem', background: '#fffbeb', padding: '0\.5rem 0\.75rem', borderRadius: '0\.5rem', fontSize: '0\.85rem', color: '#92400e', border: '1px solid #fde68a', fontWeight: 600 \}\}/g, 'className="pico-alert"');
appTsx = appTsx.replace(/style=\{\{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' \}\}/g, 'className="flex-column-start"');
appTsx = appTsx.replace(/style=\{\{ fontWeight: 'normal', opacity: 0\.8 \}\}/g, 'className="peso-small"');
appTsx = appTsx.replace(/style=\{\{marginTop: '0\.75rem'\}\}/g, 'className="add-pdf-container"');
appTsx = appTsx.replace(/style=\{\{ display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', padding: '0\.6rem', background: '#f8fafc', border: '1px dashed #cbd5e1', color: '#475569', fontSize: '0\.8rem', fontWeight: 600, borderRadius: '6px' \}\}/g, 'className="add-pdf-label"');
appTsx = appTsx.replace(/style=\{\{display: 'none'\}\}/g, 'className="d-none"');
appTsx = appTsx.replace(/style=\{carga\.divergencia \? \{\{ backgroundColor: '#fee2e2', color: '#991b1b' \}\} : \{\}\}/g, '');
appTsx = appTsx.replace(/style=\{\{ display: 'flex', flexDirection: 'column' \}\}/g, 'className="plate-cell-col"');
appTsx = appTsx.replace(/style=\{\{ fontWeight: 'bold' \}\}/g, 'className="doc-bold"');
appTsx = appTsx.replace(/style=\{\{ fontSize: '0\.8rem', color: '#64748b' \}\}/g, 'className="plate-small"');
appTsx = appTsx.replace(/style=\{\{ fontSize: '0\.75rem', fontWeight: 600, color: '#b91c1c', marginTop: '4px' \}\}/g, 'className="divergence-alert"');
appTsx = appTsx.replace(/style=\{\{ fontWeight: 600, color: '#334155' \}\}/g, 'className="romaneio-bold"');
appTsx = appTsx.replace(/style=\{\{textAlign: 'center', padding: '2rem', color: '#64748b'\}\}/g, 'className="empty-table-msg"');
appTsx = appTsx.replace(/<select className="filter-select"/g, '<select title="Filtrar" className="filter-select"');

fs.writeFileSync('src/App.tsx', appTsx);
console.log("Lints fixed");

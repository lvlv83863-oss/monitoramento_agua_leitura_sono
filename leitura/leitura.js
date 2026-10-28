// ======================================================
// LEITURA TRACKER v4.0 — Metadados auto + Capa + Nova Aba
// ======================================================

if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

let biblioteca        = JSON.parse(localStorage.getItem('leituraLivros'))  || [];
let sessoes           = JSON.parse(localStorage.getItem('leituraSessoes')) || [];
let livroAtualId      = localStorage.getItem('leituraLivroAtualId')        || null;
let metaMinutosDiaria = parseInt(localStorage.getItem('leituraMetaMinutos')) || 30;
let arquivoAtualURL   = null;
let capaAtualURL      = null;
let tipoArquivoAtual  = 'pdf';

let epubBook      = null;
let epubRendition = null;
let epubLivroId   = null;
let epubPctAtual  = 0;

let cronometroInterval = null;
let segundosTotais     = 0;
let cronometroRodando  = false;
let cronometroInicio   = null;

let _filtroBibliotecaAtual = 'todos';

// ======================================================
// SEÇÕES
// ======================================================
function showSection(id, btnEl) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    if (btnEl) btnEl.classList.add('active');
    if (id === 'biblioteca')   renderBiblioteca(_filtroBibliotecaAtual || 'todos');
    if (id === 'estatisticas') renderEstatisticas();
    if (id === 'leitura')      atualizarLivroAtualUI();
}

// ======================================================
// TIPO DE ARQUIVO
// ======================================================
function selecionarTipo(tipo) {
    tipoArquivoAtual = tipo;
    const inputArq = document.getElementById('inputArquivo');
    const dropTxt  = document.getElementById('dropZoneTexto');
    const epubInfo = document.getElementById('epubInfo');
    const btnPDF   = document.getElementById('btnTipoPDF');
    const btnEPUB  = document.getElementById('btnTipoEPUB');

    arquivoAtualURL = null; capaAtualURL = null;
    document.getElementById('nomeArquivo').textContent = '';
    inputArq.value = '';
    document.getElementById('previewCapaWrap').style.display = 'none';
    document.getElementById('inputTitulo').value  = '';
    document.getElementById('inputAutor').value   = '';
    document.getElementById('inputPaginas').value = '';

    if (tipo === 'pdf') {
        inputArq.accept = '.pdf';
        dropTxt.textContent = 'Arraste o PDF aqui ou clique para selecionar';
        epubInfo.style.display = 'none';
        btnPDF.classList.add('active'); btnEPUB.classList.remove('active');
    } else {
        inputArq.accept = '.epub';
        dropTxt.textContent = 'Arraste o EPUB aqui ou clique para selecionar';
        epubInfo.style.display = 'flex';
        btnPDF.classList.remove('active'); btnEPUB.classList.add('active');
    }
}

// ======================================================
// MODAL ADICIONAR LIVRO
// ======================================================
function abrirModal() {
    document.getElementById('modalLivro').style.display = 'flex';
    document.getElementById('inputTitulo').value  = '';
    document.getElementById('inputAutor').value   = '';
    document.getElementById('inputPaginas').value = '';
    document.getElementById('nomeArquivo').textContent = '';
    document.getElementById('inputArquivo').value = '';
    document.getElementById('previewCapaWrap').style.display = 'none';
    arquivoAtualURL = null; capaAtualURL = null;
    tipoArquivoAtual = 'pdf';
    selecionarTipo('pdf');
}
function fecharModal() {
    document.getElementById('modalLivro').style.display = 'none';
}

document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('dropZone');
    const inputArq = document.getElementById('inputArquivo');

    dropZone.addEventListener('click', () => inputArq.click());
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault(); dropZone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file) processarArquivo(file);
    });
    inputArq.addEventListener('change', (e) => {
        if (e.target.files[0]) processarArquivo(e.target.files[0]);
    });

    // Receber progresso da nova aba (PDF ou EPUB)
    window.addEventListener('message', function(e) {
        if (e.data && e.data.type === 'salvarPaginaPDF' && e.data.livroId) {
            salvarPaginaLivro(e.data.livroId, e.data.pagina, false);
        }
        if (e.data && e.data.type === 'salvarPaginaEPUB' && e.data.livroId) {
            salvarPaginaLivro(e.data.livroId, e.data.pagina, false);
        }
    });

    atualizarLivroAtualUI();
    atualizarMetaUI();
    renderBiblioteca('todos');
});

// ======================================================
// PROCESSAR ARQUIVO + EXTRAIR METADADOS AUTO
// ======================================================
function processarArquivo(file) {
    const isPDF  = file.type === 'application/pdf' || file.name.endsWith('.pdf');
    const isEPUB = file.name.endsWith('.epub') || file.type === 'application/epub+zip';

    if (tipoArquivoAtual === 'pdf'  && !isPDF)  { mostrarToast('Selecione um arquivo PDF.',  'erro'); return; }
    if (tipoArquivoAtual === 'epub' && !isEPUB) { mostrarToast('Selecione um arquivo EPUB.', 'erro'); return; }

    document.getElementById('nomeArquivo').textContent = '⏳ Lendo arquivo...';
    document.getElementById('extraindoMeta').style.display = 'flex';
    document.getElementById('previewCapaWrap').style.display = 'none';

    const reader = new FileReader();
    reader.onload = async (e) => {
        arquivoAtualURL = e.target.result;
        document.getElementById('nomeArquivo').textContent = '✅ ' + file.name;
        if (tipoArquivoAtual === 'pdf') {
            await extrairMetadataPDF(arquivoAtualURL);
        } else {
            await extrairMetadataEPUB(arquivoAtualURL);
        }
        document.getElementById('extraindoMeta').style.display = 'none';
    };
    reader.readAsDataURL(file);
}

// ── PDF ───────────────────────────────────────────────
async function extrairMetadataPDF(dataURL) {
    try {
        const pdfDoc   = await pdfjsLib.getDocument(dataURL).promise;
        const numPages = pdfDoc.numPages;

        let titulo = '', autor = '';
        try {
            const meta = await pdfDoc.getMetadata();
            titulo = (meta.info && meta.info.Title)  ? meta.info.Title.trim()  : '';
            autor  = (meta.info && meta.info.Author) ? meta.info.Author.trim() : '';
        } catch(e) {}

        if (titulo) document.getElementById('inputTitulo').value = titulo;
        if (autor)  document.getElementById('inputAutor').value  = autor;
        // Páginas sempre extraídas automaticamente do PDF
        document.getElementById('inputPaginas').value = numPages;

        // Capa = renderizar página 1
        try {
            const page     = await pdfDoc.getPage(1);
            const viewport = page.getViewport({ scale: 1.2 });
            const canvas   = document.createElement('canvas');
            canvas.width   = viewport.width;
            canvas.height  = viewport.height;
            await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
            capaAtualURL = canvas.toDataURL('image/jpeg', 0.85);
            document.getElementById('imgPreviewCapa').src = capaAtualURL;
            document.getElementById('previewCapaWrap').style.display = 'flex';
        } catch(e) {}

        mostrarToast('✅ ' + numPages + ' páginas detectadas automaticamente!', 'sucesso');
    } catch(err) {
        console.warn('Erro PDF:', err);
        mostrarToast('PDF carregado (sem metadados automáticos).', 'info');
    }
}

// ── EPUB ──────────────────────────────────────────────
async function extrairMetadataEPUB(dataURL) {
    try {
        const book = ePub(dataURL);
        await book.ready;

        const titulo = book.package?.metadata?.title   || '';
        const autor  = book.package?.metadata?.creator || '';
        if (titulo) document.getElementById('inputTitulo').value = titulo;
        if (autor)  document.getElementById('inputAutor').value  = autor;

        // Estimar total de páginas via locations
        try {
            await book.locations.generate(1500);
            const totalPgs = book.locations.length();
            if (totalPgs > 0) {
                document.getElementById('inputPaginas').value = totalPgs;
                mostrarToast('✅ ~' + totalPgs + ' páginas estimadas!', 'sucesso');
            } else {
                mostrarToast('✅ EPUB carregado. Informe o nº de páginas manualmente.', 'info');
            }
        } catch(e) {
            mostrarToast('✅ EPUB carregado. Informe o nº de páginas manualmente.', 'info');
        }

        // Capa
        try {
            const coverUrl = await book.coverUrl();
            if (coverUrl) {
                const resp = await fetch(coverUrl);
                const blob = await resp.blob();
                capaAtualURL = await new Promise(res => {
                    const r = new FileReader();
                    r.onload = e2 => res(e2.target.result);
                    r.readAsDataURL(blob);
                });
                document.getElementById('imgPreviewCapa').src = capaAtualURL;
                document.getElementById('previewCapaWrap').style.display = 'flex';
            }
        } catch(e) {}

        book.destroy();
    } catch(err) {
        console.warn('Erro EPUB:', err);
        mostrarToast('EPUB carregado.', 'info');
    }
}

// ======================================================
// SALVAR LIVRO
// ======================================================
function salvarLivro() {
    const titulo  = document.getElementById('inputTitulo').value.trim();
    const autor   = document.getElementById('inputAutor').value.trim();
    const paginas = parseInt(document.getElementById('inputPaginas').value) || 0;

    if (!titulo)          { mostrarToast('Informe o título do livro.', 'erro'); return; }
    if (!arquivoAtualURL) { mostrarToast('Selecione um arquivo ' + tipoArquivoAtual.toUpperCase() + '.', 'erro'); return; }

    const livro = {
        id: Date.now().toString(),
        titulo,
        autor:        autor || 'Autor desconhecido',
        paginas,
        paginaAtual:  0,
        paginasLidas: 0,
        status:       'lendo',
        tipo:         tipoArquivoAtual,
        arquivoURL:   arquivoAtualURL,
        capaURL:      capaAtualURL || null,
        dataCadastro: new Date().toISOString(),
    };

    biblioteca.unshift(livro);
    salvarBiblioteca();
    fecharModal();
    renderBiblioteca(_filtroBibliotecaAtual || 'todos');
    mostrarToast('📚 "' + titulo + '" adicionado à biblioteca!', 'sucesso');
}

function salvarBiblioteca() {
    localStorage.setItem('leituraLivros', JSON.stringify(biblioteca));
}

// ======================================================
// ABRIR LIVRO
// ======================================================
function abrirLivro(id) {
    const livro = biblioteca.find(l => l.id === id);
    if (!livro) return;
    livro.tipo === 'epub' ? abrirEPUB(livro) : abrirPDF(livro);
}

// ── MODAL PDF ─────────────────────────────────────────
let pdfLivroId = null;

function abrirPDF(livro) {
    pdfLivroId = livro.id;
    document.getElementById('tituloPDFModal').textContent = livro.titulo;
    document.getElementById('iframePDF').src = livro.arquivoURL;
    document.getElementById('modalPDF').style.display = 'flex';
    document.getElementById('pdfPaginaInput').value = livro.paginaAtual || '';
    document.getElementById('pdfTotalPaginasLabel').textContent =
        livro.paginas ? 'de ' + livro.paginas : '';
}

function fecharPDF() {
    const pg = parseInt(document.getElementById('pdfPaginaInput').value);
    if (!isNaN(pg) && pg > 0 && pdfLivroId) {
        salvarPaginaLivro(pdfLivroId, pg, true);
    }
    document.getElementById('iframePDF').src = '';
    document.getElementById('modalPDF').style.display = 'none';
    pdfLivroId = null;
    atualizarLivroAtualUI();
    renderBiblioteca(_filtroBibliotecaAtual || 'todos');
}

function salvarPaginaPDF() {
    const pg = parseInt(document.getElementById('pdfPaginaInput').value);
    if (isNaN(pg) || pg < 1) { mostrarToast('Informe uma página válida.', 'erro'); return; }
    if (!pdfLivroId) return;
    salvarPaginaLivro(pdfLivroId, pg);
}

// ── NOVA ABA PDF ──────────────────────────────────────
function abrirPDFNovaAba() {
    const livro = pdfLivroId ? biblioteca.find(l => l.id === pdfLivroId) : null;
    if (!livro) return;

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>${esc(livro.titulo)} — PDF</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{background:#1a0533;font-family:sans-serif;display:flex;flex-direction:column;height:100vh;overflow:hidden;}
#viewer{flex:1;min-height:0;}
iframe{width:100%;height:100%;border:none;display:block;}
.bar{background:#1e0a3c;border-top:1px solid rgba(255,255,255,0.1);padding:10px 20px;display:flex;align-items:center;gap:12px;flex-shrink:0;flex-wrap:wrap;}
label{color:rgba(255,255,255,0.7);font-size:0.85rem;}
input{width:70px;padding:5px 8px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.25);border-radius:8px;color:#fff;font-size:0.88rem;outline:none;text-align:center;}
.total{color:rgba(255,255,255,0.4);font-size:0.78rem;}
button{padding:7px 18px;background:linear-gradient(135deg,#8c00ff,#4facfe);color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:0.88rem;}
button:hover{filter:brightness(1.15);}
.titulo{flex:1;color:rgba(255,255,255,0.85);font-size:0.88rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
</style>
</head>
<body>
<div id="viewer"><iframe id="fr" src=""></iframe></div>
<div class="bar">
  <span class="titulo">${esc(livro.titulo)}</span>
  <label>📖 Você parou na página:</label>
  <input type="number" id="pg" min="1" value="${livro.paginaAtual||''}" placeholder="Nº"/>
  <span class="total">${livro.paginas?'de '+livro.paginas:''}</span>
  <button onclick="salvar()">💾 Salvar progresso</button>
</div>
<script>
var _id;
window.addEventListener('message',function(e){
  if(e.data&&e.data.type==='pdfData'){
    document.getElementById('fr').src=e.data.dataURL;
    _id=e.data.livroId;
  }
});
function salvar(){
  var pg=parseInt(document.getElementById('pg').value);
  if(!isNaN(pg)&&pg>0&&window.opener&&_id){
    window.opener.postMessage({type:'salvarPaginaPDF',livroId:_id,pagina:pg},'*');
    var b=document.querySelector('button');
    b.textContent='✅ Salvo!';
    setTimeout(function(){b.textContent='💾 Salvar progresso';},1800);
  }
}
<\/script>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url  = URL.createObjectURL(blob);
    const win  = window.open(url, '_blank');
    const send = () => {
        try { win.postMessage({ type: 'pdfData', dataURL: livro.arquivoURL, livroId: livro.id }, '*'); }
        catch(e) { setTimeout(send, 600); }
    };
    setTimeout(send, 900);
}

// ── MODAL EPUB ────────────────────────────────────────
function abrirEPUB(livro) {
    epubLivroId  = livro.id;
    epubPctAtual = 0;
    document.getElementById('tituloEPUBModal').textContent = livro.titulo;
    document.getElementById('epubPaginaInput').value = livro.paginaAtual || '';
    document.getElementById('epubPctTracker').textContent = '0%';
    document.getElementById('areaEPUB').innerHTML =
        '<div style="text-align:center;padding:40px;color:rgba(255,255,255,0.5);">' +
        '<i class="fas fa-spinner fa-spin fa-2x"></i>' +
        '<p style="margin-top:12px;">Carregando EPUB...</p></div>';
    document.getElementById('modalEPUB').style.display = 'flex';

    if (epubBook) { epubBook.destroy(); epubBook = null; epubRendition = null; }

    try {
        epubBook = ePub(livro.arquivoURL);
        epubRendition = epubBook.renderTo('areaEPUB', {
            width: '100%',
            height: document.getElementById('areaEPUB').clientHeight || 500,
            flow: 'scrolled-doc',
        });

        epubRendition.display().then(() => {
            atualizarInfoCapitulo();
        }).catch(err => {
            document.getElementById('areaEPUB').innerHTML =
                '<div style="text-align:center;padding:40px;color:#ff7675;">' +
                '<i class="fas fa-exclamation-triangle fa-2x"></i>' +
                '<p style="margin-top:12px;">Erro ao carregar EPUB.<br><small>' +
                (err.message || '') + '</small></p></div>';
        });

        epubBook.ready.then(() => atualizarInfoCapitulo());
        epubRendition.on('relocated', () => {
            atualizarInfoCapitulo();
            // Auto-salvar ao mudar de capítulo
            const pg = parseInt(document.getElementById('epubPaginaInput').value);
            if (!isNaN(pg) && pg > 0 && epubLivroId) {
                salvarPaginaLivro(epubLivroId, pg, true);
            }
        });
    } catch(err) {
        document.getElementById('areaEPUB').innerHTML =
            '<div style="text-align:center;padding:40px;color:#ff7675;">' +
            '<i class="fas fa-exclamation-triangle fa-2x"></i>' +
            '<p style="margin-top:12px;">Não foi possível renderizar este EPUB.</p></div>';
    }
}

function atualizarInfoCapitulo() {
    if (!epubBook || !epubRendition) return;
    try {
        const loc = epubRendition.currentLocation();
        if (loc && loc.start) {
            const pct = Math.round(epubBook.locations.percentageFromCfi(loc.start.cfi) * 100);
            const pctVal = isNaN(pct) ? 0 : pct;
            epubPctAtual = pctVal;
            document.getElementById('epubCapituloInfo').textContent = pctVal ? pctVal + '% do livro' : '';
            document.getElementById('epubBarra').style.width = pctVal + '%';
            document.getElementById('epubPctTracker').textContent = pctVal + '%';
            const livro = biblioteca.find(l => l.id === epubLivroId);
            if (livro && livro.paginas > 0 && pctVal > 0) {
                const pgEstimada = Math.round((pctVal / 100) * livro.paginas);
                document.getElementById('epubPaginaInput').value = pgEstimada;
            }
        }
    } catch(e) {}
}

function epubProximo()  { if (epubRendition) epubRendition.next(); }
function epubAnterior() { if (epubRendition) epubRendition.prev(); }

function fecharEPUB() {
    const pg = parseInt(document.getElementById('epubPaginaInput').value);
    if (!isNaN(pg) && pg > 0 && epubLivroId) {
        salvarPaginaLivro(epubLivroId, pg, true);
    }
    document.getElementById('modalEPUB').style.display = 'none';
    if (epubBook) { epubBook.destroy(); epubBook = null; epubRendition = null; }
    epubLivroId = null;
    atualizarLivroAtualUI();
    renderBiblioteca(_filtroBibliotecaAtual || 'todos');
}

function salvarPaginaEPUB() {
    const pg = parseInt(document.getElementById('epubPaginaInput').value);
    if (isNaN(pg) || pg < 1) { mostrarToast('Informe uma página válida.', 'erro'); return; }
    if (!epubLivroId) return;
    salvarPaginaLivro(epubLivroId, pg);
}

// ── NOVA ABA EPUB ─────────────────────────────────────
function abrirEPUBNovaAba() {
    const livro = epubLivroId ? biblioteca.find(l => l.id === epubLivroId) : null;
    if (!livro) { mostrarToast('Nenhum EPUB aberto.', 'erro'); return; }

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>${esc(livro.titulo)} — EPUB</title>
<script src="https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"><\/script>
<script src="https://cdn.jsdelivr.net/npm/epubjs@0.3.93/dist/epub.min.js"><\/script>
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{background:#1a0533;font-family:sans-serif;display:flex;flex-direction:column;height:100vh;overflow:hidden;}
#viewer{flex:1;background:#fff;overflow:auto;min-height:0;}
.prog{height:3px;background:rgba(255,255,255,0.1);flex-shrink:0;}
.prog-fill{height:100%;background:linear-gradient(90deg,#4facfe,#00f2fe);transition:width 0.5s;}
.bar{background:#1e0a3c;border-top:1px solid rgba(255,255,255,0.1);padding:10px 20px;display:flex;align-items:center;gap:12px;flex-shrink:0;flex-wrap:wrap;}
.nav{padding:7px 14px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:#fff;border-radius:8px;cursor:pointer;font-size:0.88rem;}
.nav:hover{background:rgba(255,255,255,0.2);}
#info{flex:1;color:rgba(255,255,255,0.7);font-size:0.85rem;text-align:center;}
label{color:rgba(255,255,255,0.7);font-size:0.82rem;}
input{width:70px;padding:5px 8px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.25);border-radius:8px;color:#fff;font-size:0.88rem;outline:none;text-align:center;}
.total{color:rgba(255,255,255,0.4);font-size:0.75rem;}
button{padding:7px 16px;background:linear-gradient(135deg,#8c00ff,#4facfe);color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:0.88rem;}
button:hover{filter:brightness(1.15);}
</style>
</head>
<body>
<div class="prog"><div class="prog-fill" id="pf" style="width:0%"></div></div>
<div id="viewer"></div>
<div class="bar">
  <button class="nav" onclick="r&&r.prev()">&#9664; Anterior</button>
  <div id="info">Carregando ${esc(livro.titulo)}...</div>
  <button class="nav" onclick="r&&r.next()">Próximo &#9654;</button>
  <label>📖 Página:</label>
  <input type="number" id="pg" min="1" value="${livro.paginaAtual||''}" placeholder="Nº"/>
  <span class="total">${livro.paginas?'de '+livro.paginas:''}</span>
  <button onclick="salvar()">💾 Salvar</button>
</div>
<script>
var book,r,_id;
window.addEventListener('message',function(e){
  if(e.data&&e.data.type==='epubData'){
    _id=e.data.livroId;
    book=ePub(e.data.dataURL);
    r=book.renderTo('viewer',{width:'100%',height:document.getElementById('viewer').offsetHeight||500,flow:'paginated'});
    r.display();
    r.on('relocated',function(loc){
      try{
        var pct=Math.round(book.locations.percentageFromCfi(loc.start.cfi)*100);
        if(!isNaN(pct)){
          document.getElementById('info').textContent=pct+'% — ${esc(livro.titulo)}';
          document.getElementById('pf').style.width=pct+'%';
          if(${livro.paginas}>0){
            document.getElementById('pg').value=Math.round((pct/100)*${livro.paginas});
          }
        }
      }catch(e2){}
    });
  }
});
function salvar(){
  var pg=parseInt(document.getElementById('pg').value);
  if(!isNaN(pg)&&pg>0&&window.opener&&_id){
    window.opener.postMessage({type:'salvarPaginaEPUB',livroId:_id,pagina:pg},'*');
    var b=document.querySelector('button:last-child');
    b.textContent='✅ Salvo!';
    setTimeout(function(){b.textContent='💾 Salvar';},1800);
  }
}
<\/script>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url  = URL.createObjectURL(blob);
    const win  = window.open(url, '_blank');
    const send = () => {
        try { win.postMessage({ type: 'epubData', dataURL: livro.arquivoURL, livroId: livro.id }, '*'); }
        catch(e) { setTimeout(send, 600); }
    };
    setTimeout(send, 900);
}

// ── HELPER ESCAPE HTML ────────────────────────────────
function esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── SALVAR PÁGINA COM ACUMULAÇÃO ──────────────────────
function salvarPaginaLivro(id, pagina, silencioso) {
    const livro = biblioteca.find(l => l.id === id);
    if (!livro) return;
    const anterior = livro.paginaAtual || 0;
    livro.paginaAtual = livro.paginas ? Math.min(pagina, livro.paginas) : pagina;
    // Acumula páginas lidas (só conta avanço)
    if (livro.paginaAtual > anterior) {
        livro.paginasLidas = (livro.paginasLidas || 0) + (livro.paginaAtual - anterior);
    }
    livro.ultimaLeitura = new Date().toISOString();
    salvarBiblioteca();
    atualizarLivroAtualUI();
    if (document.getElementById('biblioteca').classList.contains('active')) {
        renderBiblioteca(_filtroBibliotecaAtual || 'todos');
    }
    if (!silencioso) mostrarToast('📌 Página ' + livro.paginaAtual + ' salva!', 'sucesso');
}

// ======================================================
// LIVRO ATUAL UI
// ======================================================
function selecionarLivroAtual(id) {
    livroAtualId = id;
    localStorage.setItem('leituraLivroAtualId', id);
    atualizarLivroAtualUI();
    showSection('leitura', document.querySelector('.tab-btn'));
    mostrarToast('Livro selecionado!', 'sucesso');
}

function lerLivroAtual() {
    if (!livroAtualId) return;
    const livro = biblioteca.find(l => l.id === livroAtualId);
    if (livro) abrirLivro(livro.id);
}

function atualizarLivroAtualUI() {
    const livro  = biblioteca.find(l => l.id === livroAtualId);
    const semEl  = document.getElementById('semLivroAtual');
    const infoEl = document.getElementById('infoLivroAtual');
    if (!livro) {
        if (semEl)  semEl.style.display  = 'flex';
        if (infoEl) infoEl.style.display = 'none';
        return;
    }
    if (semEl)  semEl.style.display  = 'none';
    if (infoEl) infoEl.style.display = 'block';

    document.getElementById('tituloAtual').textContent = livro.titulo;
    document.getElementById('autorAtual').textContent  = livro.autor;

    const tipoEl = document.getElementById('tipoLivroAtual');
    if (tipoEl) {
        tipoEl.textContent = livro.tipo === 'epub' ? '📖 EPUB' : '📄 PDF';
        tipoEl.className = 'badge-tipo badge-' + livro.tipo;
    }

    const capaEl = document.getElementById('capaAtual');
    if (capaEl) {
        if (livro.capaURL) {
            capaEl.innerHTML = '<img src="' + livro.capaURL + '" alt="Capa" style="width:100%;height:100%;object-fit:cover;border-radius:8px;" />';
        } else {
            capaEl.innerHTML = '<i class="fas fa-' + (livro.tipo === 'epub' ? 'book' : 'file-pdf') + '"></i>';
        }
    }

    const pct = livro.paginas > 0
        ? Math.min(Math.round((livro.paginaAtual / livro.paginas) * 100), 100) : 0;
    document.getElementById('percentualLeitura').textContent = pct + '%';
    document.getElementById('barraProgresso').style.width    = pct + '%';
    document.getElementById('paginaAtualNum').textContent    = livro.paginaAtual || 0;
    document.getElementById('totalPaginasNum').textContent   = livro.paginas || '?';
}

function atualizarPagina() {
    const pg = parseInt(document.getElementById('inputPaginaAtual').value);
    if (!livroAtualId || isNaN(pg) || pg < 0) { mostrarToast('Página inválida.', 'erro'); return; }
    salvarPaginaLivro(livroAtualId, pg);
}

// ======================================================
// BIBLIOTECA
// ======================================================
function filtrarBiblioteca(filtro, btn) {
    _filtroBibliotecaAtual = filtro;
    document.querySelectorAll('.filtro-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderBiblioteca(filtro);
}

function renderBiblioteca(filtro) {
    const grid = document.getElementById('gridLivros');
    let lista = biblioteca;
    if (filtro === 'lendo')     lista = biblioteca.filter(l => l.status === 'lendo');
    if (filtro === 'concluido') lista = biblioteca.filter(l => l.status === 'concluido');
    if (filtro === 'pdf')       lista = biblioteca.filter(l => l.tipo === 'pdf');
    if (filtro === 'epub')      lista = biblioteca.filter(l => l.tipo === 'epub');

    if (lista.length === 0) {
        grid.innerHTML = `<div class="empty-state" id="emptyBiblioteca">
            <i class="fas fa-book" style="font-size:3rem;opacity:0.3;"></i>
            <p>Nenhum livro encontrado.</p>
            <button class="btn btn-primary" onclick="abrirModal()">
                <i class="fas fa-plus"></i> Adicionar Livro
            </button>
        </div>`;
        return;
    }

    grid.innerHTML = lista.map(livro => {
        const pct   = livro.paginas > 0
            ? Math.min(Math.round((livro.paginaAtual / livro.paginas) * 100), 100) : 0;
        const ativo = livro.id === livroAtualId ? 'livro-card-ativo' : '';

        const capaHtml = livro.capaURL
            ? `<div class="livro-card-capa livro-card-capa-img">
                   <img src="${livro.capaURL}" alt="Capa" />
                   <div class="capa-overlay">
                       <button class="btn-ler-overlay" onclick="abrirLivro('${livro.id}')">
                           <i class="fas fa-book-open"></i> Ler
                       </button>
                   </div>
               </div>`
            : `<div class="livro-card-capa">
                   <i class="fas fa-${livro.tipo === 'epub' ? 'book' : 'file-pdf'}"></i>
                   <div class="capa-overlay">
                       <button class="btn-ler-overlay" onclick="abrirLivro('${livro.id}')">
                           <i class="fas fa-book-open"></i> Ler
                       </button>
                   </div>
               </div>`;

        const iconeArquivo = livro.tipo === 'epub'
            ? '<span class="badge-formato badge-epub"><i class="fas fa-book"></i> EPUB</span>'
            : '<span class="badge-formato badge-pdf"><i class="fas fa-file-pdf"></i> PDF</span>';

        const ultimaLeitura = livro.ultimaLeitura
            ? `<small class="ultima-leitura"><i class="fas fa-clock"></i> ${new Date(livro.ultimaLeitura).toLocaleDateString('pt-BR')}</small>`
            : '';

        return `
        <div class="livro-card ${ativo}">
            ${capaHtml}
            <div class="livro-card-body">
                <div class="livro-card-titulo" title="${esc(livro.titulo)}">${esc(livro.titulo)}</div>
                <div class="livro-card-autor text-muted">${esc(livro.autor)}</div>
                ${iconeArquivo}
                ${livro.paginas > 0 ? `
                <div class="progresso-mini" style="margin-top:8px;">
                    <div class="progresso-labels" style="font-size:0.78rem;">
                        <span>Pág. ${livro.paginaAtual||0} / ${livro.paginas}</span>
                        <span>${pct}%</span>
                    </div>
                    <div class="progress-bar-bg" style="height:5px;margin-top:4px;">
                        <div class="progress-bar-fill" style="width:${pct}%;"></div>
                    </div>
                </div>` : ''}
                ${ultimaLeitura}
                <div class="livro-card-acoes">
                    <button class="btn btn-primary btn-sm" onclick="abrirLivro('${livro.id}')">
                        <i class="fas fa-eye"></i> Ler
                    </button>
                    <button class="btn btn-secondary btn-sm" onclick="selecionarLivroAtual('${livro.id}')">
                        <i class="fas fa-bookmark"></i>
                    </button>
                    <button class="btn btn-success btn-sm" onclick="concluirLivroId('${livro.id}')">
                        <i class="fas fa-check"></i>
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="removerLivro('${livro.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
                <span class="badge badge-${livro.status}">
                    ${livro.status === 'concluido' ? '✅ Concluído' : '📖 Lendo'}
                </span>
            </div>
        </div>`;
    }).join('');
}

function concluirLivro() {
    if (!livroAtualId) return;
    concluirLivroId(livroAtualId);
}
function concluirLivroId(id) {
    const livro = biblioteca.find(l => l.id === id);
    if (!livro) return;
    if (livro.status === 'concluido') { mostrarToast('Livro já concluído!', 'info'); return; }
    livro.status = 'concluido';
    livro.dataConclusao = new Date().toISOString();
    if (livro.paginas) livro.paginaAtual = livro.paginas;
    salvarBiblioteca();
    atualizarLivroAtualUI();
    renderBiblioteca(_filtroBibliotecaAtual || 'todos');
    mostrarToast('🎉 "' + livro.titulo + '" concluído!', 'sucesso');
}
function removerLivro(id) {
    if (!confirm('Remover este livro da biblioteca?')) return;
    biblioteca = biblioteca.filter(l => l.id !== id);
    if (livroAtualId === id) {
        livroAtualId = null;
        localStorage.removeItem('leituraLivroAtualId');
    }
    salvarBiblioteca();
    renderBiblioteca(_filtroBibliotecaAtual || 'todos');
    atualizarLivroAtualUI();
    mostrarToast('Livro removido.', 'info');
}

// ======================================================
// CRONÔMETRO
// ======================================================
function pad(n) { return String(n).padStart(2, '0'); }
function atualizarDisplayCronometro() {
    const h = Math.floor(segundosTotais / 3600);
    const m = Math.floor((segundosTotais % 3600) / 60);
    const s = segundosTotais % 60;
    document.getElementById('horas').textContent    = pad(h);
    document.getElementById('minutos').textContent  = pad(m);
    document.getElementById('segundos').textContent = pad(s);
}
function iniciarCronometro() {
    if (cronometroRodando) return;
    cronometroRodando = true;
    cronometroInicio  = cronometroInicio || new Date();
    document.getElementById('btnIniciar').disabled = true;
    document.getElementById('btnPausar').disabled  = false;
    document.getElementById('btnParar').disabled   = false;
    document.getElementById('sessaoInfo').style.display = 'none';
    cronometroInterval = setInterval(() => { segundosTotais++; atualizarDisplayCronometro(); }, 1000);
}
function pausarCronometro() {
    if (!cronometroRodando) return;
    cronometroRodando = false;
    clearInterval(cronometroInterval);
    document.getElementById('btnIniciar').disabled = false;
    document.getElementById('btnPausar').disabled  = true;
}
function pararCronometro() {
    if (segundosTotais === 0) return;
    clearInterval(cronometroInterval);
    cronometroRodando = false;
    const minutos = Math.floor(segundosTotais / 60);
    const sRest   = segundosTotais % 60;
    const duracaoTexto = minutos > 0
        ? (minutos + ' min' + (sRest > 0 ? ' ' + sRest + 's' : ''))
        : (segundosTotais + 's');
    const hoje = new Date().toISOString().split('T')[0];
    sessoes.unshift({
        data: hoje, dataHora: new Date().toISOString(),
        segundos: segundosTotais, minutos,
        livroId: livroAtualId || null,
        livroTitulo: livroAtualId
            ? (biblioteca.find(l => l.id === livroAtualId)?.titulo || 'Desconhecido')
            : 'Sem livro',
    });
    localStorage.setItem('leituraSessoes', JSON.stringify(sessoes));
    document.getElementById('duracaoSessao').textContent = duracaoTexto;
    document.getElementById('sessaoInfo').style.display  = 'block';
    document.getElementById('btnIniciar').disabled = false;
    document.getElementById('btnPausar').disabled  = true;
    document.getElementById('btnParar').disabled   = true;
    segundosTotais = 0; cronometroInicio = null;
    atualizarDisplayCronometro();
    atualizarMetaUI();
    mostrarToast('Sessão de ' + duracaoTexto + ' registrada!', 'sucesso');
}

// ======================================================
// META DIÁRIA
// ======================================================
function salvarMeta() {
    const val = parseInt(document.getElementById('metaMinutos').value);
    if (!val || val < 1) { mostrarToast('Meta inválida.', 'erro'); return; }
    metaMinutosDiaria = val;
    localStorage.setItem('leituraMetaMinutos', val);
    atualizarMetaUI();
    mostrarToast('Meta atualizada!', 'sucesso');
}
function atualizarMetaUI() {
    const hoje = new Date().toISOString().split('T')[0];
    const minutosHoje = sessoes.filter(s => s.data === hoje).reduce((a, s) => a + s.minutos, 0);
    document.getElementById('minutosHoje').textContent = minutosHoje;
    document.getElementById('metaLabel').textContent   = 'Meta: ' + metaMinutosDiaria + ' min';
    document.getElementById('metaMinutos').value       = metaMinutosDiaria;
    const pct = Math.min(Math.round((minutosHoje / metaMinutosDiaria) * 100), 100);
    document.getElementById('barraMetaDiaria').style.width = pct + '%';
}

// ======================================================
// ESTATÍSTICAS
// ======================================================
let chartSemanalInst = null;
let chartMensalInst  = null;

function renderEstatisticas() {
    document.getElementById('statLivrosLidos').textContent =
        biblioteca.filter(l => l.status === 'concluido').length;
    const diasObj   = agruparPorDia(sessoes, 30);
    const diasChave = Object.keys(diasObj);
    const totalMin  = diasChave.reduce((a, k) => a + diasObj[k], 0);
    document.getElementById('statMediaDiaria').textContent =
        (diasChave.length > 0 ? Math.round(totalMin / diasChave.length) : 0) + ' min';
    const sem = agruparPorDia(sessoes, 7);
    document.getElementById('statMediaSemanal').textContent =
        Object.values(sem).reduce((a, v) => a + v, 0) + ' min';
    document.getElementById('statSequencia').textContent = calcularSequencia();
    renderChartSemanal();
    renderChartMensal();
    renderHistoricoSessoes();
}
function agruparPorDia(arr, dias) {
    const res = {};
    const hoje = new Date();
    for (let i = 0; i < dias; i++) {
        const d = new Date(hoje); d.setDate(hoje.getDate() - i);
        res[d.toISOString().split('T')[0]] = 0;
    }
    arr.forEach(s => { if (Object.prototype.hasOwnProperty.call(res, s.data)) res[s.data] += s.minutos; });
    return res;
}
function calcularSequencia() {
    const hoje = new Date();
    let seq = 0;
    for (let i = 0; i < 365; i++) {
        const d = new Date(hoje); d.setDate(hoje.getDate() - i);
        const chave = d.toISOString().split('T')[0];
        if (sessoes.some(s => s.data === chave)) seq++;
        else if (i > 0) break;
    }
    return seq;
}
function renderChartSemanal() {
    const ctx = document.getElementById('chartSemanal').getContext('2d');
    if (chartSemanalInst) chartSemanalInst.destroy();
    const obj = agruparPorDia(sessoes, 7);
    const labels = Object.keys(obj).reverse().map(d => { const [,m,dia] = d.split('-'); return dia+'/'+m; });
    chartSemanalInst = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Minutos lidos', data: Object.values(obj).reverse(),
            backgroundColor: 'rgba(79,172,254,0.7)', borderColor: '#4facfe',
            borderWidth: 2, borderRadius: 8 }] },
        options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });
}
function renderChartMensal() {
    const ctx = document.getElementById('chartMensal').getContext('2d');
    if (chartMensalInst) chartMensalInst.destroy();
    const obj = agruparPorDia(sessoes, 30);
    const labels = Object.keys(obj).reverse().map(d => { const [,m,dia] = d.split('-'); return dia+'/'+m; });
    chartMensalInst = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets: [{ label: 'Minutos lidos', data: Object.values(obj).reverse(),
            borderColor: '#43e97b', backgroundColor: 'rgba(67,233,123,0.15)',
            fill: true, tension: 0.4, pointRadius: 3 }] },
        options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });
}
function renderHistoricoSessoes() {
    const container = document.getElementById('historicoSessoes');
    if (sessoes.length === 0) {
        container.innerHTML = '<p class="text-muted" style="text-align:center;">Nenhuma sessão registrada ainda.</p>';
        return;
    }
    container.innerHTML = sessoes.slice(0, 20).map(s => {
        const dt   = new Date(s.dataHora);
        const hora = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        return `<div class="historico-item">
            <div>
                <strong>${esc(s.livroTitulo)}</strong>
                <p class="text-muted" style="font-size:0.8rem;margin:0;">${s.data} às ${hora}</p>
            </div>
            <span class="badge badge-lendo">${s.minutos} min</span>
        </div>`;
    }).join('');
}

// ======================================================
// TOAST
// ======================================================
let toastTimer = null;
function mostrarToast(msg, tipo) {
    tipo = tipo || 'sucesso';
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast toast-' + tipo + ' show';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

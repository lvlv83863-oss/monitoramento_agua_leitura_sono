// ======================================================
// SONOTRACKER — sonho.js v2.0
// Monitoramento completo de sono e sonhos
// ======================================================

// ---- Estado global ----
let registrosSono  = JSON.parse(localStorage.getItem('st_sono')   || '[]');
let registrosSonho = JSON.parse(localStorage.getItem('st_sonhos') || '[]');
let metaHoras      = parseFloat(localStorage.getItem('st_metaHoras') || '8');
let qualidadeSelecionada = 0;
let humorSelecionado = { emoji: '', label: '' };
let tipoSonhoSelecionado = 'normal';

// ---- Charts globais ----
let chartMiniSemana = null;
let chartHoras      = null;
let chartQualidade  = null;
let chartHorario    = null;
let chartTiposSonho = null;

// ======================================================
// RELÓGIO
// ======================================================
function atualizarRelogio() {
    const el = document.getElementById('relogioAtual');
    if (!el) return;
    const agora = new Date();
    el.textContent = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
setInterval(atualizarRelogio, 1000);
atualizarRelogio();

// ======================================================
// TABS
// ======================================================
function mostrarAba(id, btn) {
    document.querySelectorAll('.aba').forEach(a => a.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    if (btn) btn.classList.add('active');

    if (id === 'visaoGeral')   renderVisaoGeral();
    if (id === 'registros')    renderRegistros();
    if (id === 'diarioSonhos') renderSonhos('todos');
    if (id === 'estatisticas') renderEstatisticas();
    if (id === 'metas')        renderMetas();
}

// ======================================================
// MODAIS
// ======================================================
function abrirModal(id) {
    document.getElementById(id).classList.add('active');
    document.body.style.overflow = 'hidden';
}
function fecharModal(id) {
    document.getElementById(id).classList.remove('active');
    document.body.style.overflow = '';
}

document.addEventListener('click', e => {
    ['modalSono','modalSonho','modalDetalheSonho'].forEach(id => {
        const el = document.getElementById(id);
        if (el && e.target === el) fecharModal(id);
    });
});
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') ['modalSono','modalSonho','modalDetalheSonho'].forEach(id => fecharModal(id));
});

// ======================================================
// MODAL: REGISTRAR SONO
// ======================================================
function abrirRegistrarSono() {
    qualidadeSelecionada = 0;
    humorSelecionado = { emoji: '', label: '' };

    document.getElementById('horaDormiu').value  = '22:30';
    document.getElementById('horaAcordou').value = '06:30';
    document.getElementById('dataSono').value    = new Date().toISOString().split('T')[0];
    document.getElementById('obsNota').value     = '';
    document.getElementById('labelQualidade').textContent = 'Selecione a qualidade';

    document.querySelectorAll('.estrela').forEach(e => e.classList.remove('ativa'));
    document.querySelectorAll('.humor-btn').forEach(b => b.classList.remove('ativo'));
    document.querySelectorAll('.fatores-grid input[type="checkbox"]').forEach(c => c.checked = false);

    abrirModal('modalSono');
}

function selecionarQualidade(val) {
    qualidadeSelecionada = val;
    const labels = ['', 'Muito ruim 😞', 'Ruim 😕', 'Regular 😐', 'Boa 😊', 'Excelente 🌟'];
    document.getElementById('labelQualidade').textContent = labels[val];
    document.querySelectorAll('.estrela').forEach(e => {
        e.classList.toggle('ativa', parseInt(e.dataset.val) <= val);
    });
}

function selecionarHumor(emoji, label) {
    humorSelecionado = { emoji, label };
    document.querySelectorAll('.humor-btn').forEach(b => {
        b.classList.toggle('ativo', b.dataset.humor === emoji);
    });
}

function salvarSono() {
    const dormiu  = document.getElementById('horaDormiu').value;
    const acordou = document.getElementById('horaAcordou').value;
    const data    = document.getElementById('dataSono').value;
    const obs     = document.getElementById('obsNota').value.trim();

    if (!dormiu || !acordou || !data) { mostrarToast('Preencha horário e data.', 'erro'); return; }

    // Calcular duração
    const [hD, mD] = dormiu.split(':').map(Number);
    const [hA, mA] = acordou.split(':').map(Number);
    let minutos = (hA * 60 + mA) - (hD * 60 + mD);
    if (minutos <= 0) minutos += 24 * 60; // passou da meia-noite
    const horas = minutos / 60;

    const fatores = Array.from(document.querySelectorAll('.fatores-grid input[type="checkbox"]:checked')).map(c => c.value);

    const registro = {
        id: Date.now().toString(),
        data,
        dormiu,
        acordou,
        minutos,
        horas: Math.round(horas * 100) / 100,
        qualidade: qualidadeSelecionada,
        humor: humorSelecionado,
        fatores,
        obs,
        criadoEm: new Date().toISOString(),
    };

    registrosSono.unshift(registro);
    salvarDados();
    fecharModal('modalSono');
    renderVisaoGeral();
    mostrarToast(`✅ Sono de ${formatarHoras(horas)} registrado!`, 'sucesso');
}

// ======================================================
// MODAL: REGISTRAR SONHO
// ======================================================
function abrirRegistrarSonho() {
    tipoSonhoSelecionado = 'normal';
    document.getElementById('sonhoTitulo').value    = '';
    document.getElementById('sonhoDescricao').value = '';
    document.getElementById('sonhoTags').value      = '';
    document.getElementById('sonhoData').value      = new Date().toISOString().split('T')[0];
    document.getElementById('clarezaMemoria').value = '3';
    document.getElementById('labelClareza').textContent = 'Clareza: Média';
    document.querySelectorAll('.tipo-sonho-btn').forEach(b => b.classList.remove('ativo'));
    document.querySelector('.tipo-sonho-btn[data-tipo="normal"]').classList.add('ativo');
    document.querySelectorAll('.emocao-item input').forEach(c => c.checked = false);
    abrirModal('modalSonho');
}

function selecionarTipoSonho(tipo) {
    tipoSonhoSelecionado = tipo;
    document.querySelectorAll('.tipo-sonho-btn').forEach(b => b.classList.toggle('ativo', b.dataset.tipo === tipo));
}

function atualizarClareza(val) {
    const labels = ['', 'Muito vago', 'Vago', 'Média', 'Nítido', 'Muito nítido'];
    document.getElementById('labelClareza').textContent = 'Clareza: ' + labels[val];
}

function salvarSonho() {
    const titulo    = document.getElementById('sonhoTitulo').value.trim();
    const descricao = document.getElementById('sonhoDescricao').value.trim();
    const data      = document.getElementById('sonhoData').value;
    const clareza   = parseInt(document.getElementById('clarezaMemoria').value);
    const tagsRaw   = document.getElementById('sonhoTags').value;

    if (!descricao) { mostrarToast('Descreva seu sonho.', 'erro'); return; }

    const emocoes = Array.from(document.querySelectorAll('.emocao-item input:checked')).map(c => c.value);
    const tags = tagsRaw.split(',').map(t => t.trim()).filter(Boolean);

    const sonho = {
        id: Date.now().toString(),
        titulo: titulo || 'Sonho sem título',
        descricao,
        data: data || new Date().toISOString().split('T')[0],
        tipo: tipoSonhoSelecionado,
        emocoes,
        clareza,
        tags,
        criadoEm: new Date().toISOString(),
    };

    registrosSonho.unshift(sonho);
    salvarDados();
    fecharModal('modalSonho');
    mostrarToast('🌙 Sonho registrado no diário!', 'sucesso');
    renderSonhos('todos');
    atualizarStatsMini();
}

// ======================================================
// PERSISTÊNCIA
// ======================================================
function salvarDados() {
    localStorage.setItem('st_sono',   JSON.stringify(registrosSono));
    localStorage.setItem('st_sonhos', JSON.stringify(registrosSonho));
}

// ======================================================
// HELPERS
// ======================================================
function formatarHoras(h) {
    const hInt = Math.floor(h);
    const min  = Math.round((h - hInt) * 60);
    return min > 0 ? `${hInt}h ${min}min` : `${hInt}h`;
}
function formatarData(dateStr) {
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
}
function getCorQualidade(q) {
    const cores = ['', '#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#27ae60'];
    return cores[q] || '#888';
}
function getLabelQualidade(q) {
    return ['', 'Muito ruim', 'Ruim', 'Regular', 'Boa', 'Excelente'][q] || '--';
}
function getIconeTipo(tipo) {
    return { normal: '💭', lucido: '✨', pesadelo: '😱', recorrente: '🔄' }[tipo] || '💭';
}

// ======================================================
// VISÃO GERAL
// ======================================================
function renderVisaoGeral() {
    renderUltimaNoite();
    atualizarStatsMini();
    renderInsight();
    renderMiniChartSemana();
}

function renderUltimaNoite() {
    const el = document.getElementById('ultimaNoiteConteudo');
    const badge = document.getElementById('badgeUltimaNoite');
    if (registrosSono.length === 0) {
        el.innerHTML = '<div class="empty-state-inline"><i class="fas fa-moon"></i><p>Registre sua primeira noite de sono!</p></div>';
        badge.textContent = '';
        return;
    }
    const r = registrosSono[0];
    const corQ = getCorQualidade(r.qualidade);
    badge.textContent = r.qualidade ? '⭐ ' + getLabelQualidade(r.qualidade) : '';
    badge.style.background = r.qualidade ? corQ + '33' : '';
    badge.style.color = corQ;

    el.innerHTML = `
        <div class="noite-grid">
            <div class="noite-item">
                <i class="fas fa-moon"></i>
                <div><small>Dormiu</small><strong>${r.dormiu}</strong></div>
            </div>
            <div class="noite-item">
                <i class="fas fa-sun"></i>
                <div><small>Acordou</small><strong>${r.acordou}</strong></div>
            </div>
            <div class="noite-item noite-destaque" style="border-color:${corQ}">
                <i class="fas fa-clock" style="color:${corQ}"></i>
                <div><small>Duração</small><strong style="color:${corQ}">${formatarHoras(r.horas)}</strong></div>
            </div>
            ${r.humor.emoji ? `<div class="noite-item"><span style="font-size:1.5rem;">${r.humor.emoji}</span><div><small>Humor</small><strong>${r.humor.label}</strong></div></div>` : ''}
        </div>
        ${r.fatores && r.fatores.length ? `<div class="fatores-tags">${r.fatores.map(f => `<span class="fator-tag">${f}</span>`).join('')}</div>` : ''}
        ${r.obs ? `<p class="noite-obs"><i class="fas fa-comment"></i> ${r.obs}</p>` : ''}
        <small class="data-label">${formatarData(r.data)}</small>
    `;
}

function atualizarStatsMini() {
    // Média semanal (últimos 7 dias)
    const ultimos7 = registrosSono.filter(r => {
        const diff = (new Date() - new Date(r.data)) / 86400000;
        return diff <= 7;
    });
    const mediaSem = ultimos7.length ? ultimos7.reduce((a, r) => a + r.horas, 0) / ultimos7.length : 0;
    document.getElementById('mediaSemanal').textContent = mediaSem ? formatarHoras(mediaSem) : '--';

    // Qualidade média
    const comQual = registrosSono.filter(r => r.qualidade > 0);
    const mediaQ  = comQual.length ? (comQual.reduce((a, r) => a + r.qualidade, 0) / comQual.length).toFixed(1) : '--';
    document.getElementById('mediaQualidade').textContent = mediaQ !== '--' ? mediaQ + ' ⭐' : '--';

    // Sequência
    document.getElementById('sequenciaAtual').textContent = calcularSequencia();

    // Total sonhos
    document.getElementById('totalSonhos').textContent = registrosSonho.length;
}

function calcularSequencia() {
    const hoje = new Date();
    let seq = 0;
    for (let i = 0; i < 365; i++) {
        const d = new Date(hoje);
        d.setDate(hoje.getDate() - i);
        const chave = d.toISOString().split('T')[0];
        if (registrosSono.some(r => r.data === chave)) seq++;
        else if (i > 0) break;
    }
    return seq;
}

function renderInsight() {
    const el = document.getElementById('textoInsight');
    const insights = gerarInsights();
    el.textContent = insights[Math.floor(Date.now() / 86400000) % insights.length];
}

function gerarInsights() {
    const base = [
        '🌙 A melatonina começa a ser liberada por volta das 21h. Diminua as luzes antes desse horário.',
        '😴 Adultos precisam de 7-9 horas de sono por noite para pleno funcionamento cognitivo.',
        '🧠 Durante o sono REM, o cérebro consolida memórias e processa emoções do dia.',
        '📵 Evite o celular 1 hora antes de dormir — a luz azul confunde o seu relógio biológico.',
        '☕ A cafeína tem meia-vida de 5-6 horas. Um café às 16h ainda afeta seu sono às 22h.',
        '🏃 Exercícios regulares melhoram a qualidade do sono, mas evite atividade intensa após as 19h.',
        '🌡️ O corpo precisa reduzir a temperatura central para iniciar o sono. Um quarto fresco ajuda muito.',
        '📓 Registrar seus sonhos ao acordar melhora a memória onírica e o autoconhecimento.',
        '🧘 Meditação de 10 minutos antes de dormir pode reduzir o tempo para adormecer em até 50%.',
        '💤 Sonhos lúcidos ocorrem principalmente durante o sono REM, nas últimas horas da noite.',
    ];

    const insights = [...base];
    if (registrosSono.length > 2) {
        const mediaH = registrosSono.slice(0, 7).reduce((a, r) => a + r.horas, 0) / Math.min(registrosSono.length, 7);
        if (mediaH < 6) insights.unshift('⚠️ Sua média está abaixo de 6h. Privação crônica de sono afeta imunidade, humor e cognição.');
        if (mediaH > 9) insights.unshift('ℹ️ Sua média está acima de 9h. Dormir demais também pode indicar fadiga ou depressão — observe como se sente.');

        const comCafeina = registrosSono.filter(r => r.fatores?.includes('cafeina'));
        if (comCafeina.length > 2) {
            const mediaQC = comCafeina.reduce((a, r) => a + (r.qualidade || 3), 0) / comCafeina.length;
            if (mediaQC < 3) insights.unshift('☕ Seus registros com cafeína mostram qualidade de sono abaixo da média. Considere reduzir.');
        }
    }
    return insights;
}

function renderMiniChartSemana() {
    const ctx = document.getElementById('chartMiniSemana')?.getContext('2d');
    if (!ctx) return;
    if (chartMiniSemana) { chartMiniSemana.destroy(); chartMiniSemana = null; }

    const dias = [];
    const horas = [];
    const qualidades = [];
    const meta = metaHoras;

    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const chave = d.toISOString().split('T')[0];
        const [, m, dia] = chave.split('-');
        dias.push(`${dia}/${m}`);
        const reg = registrosSono.find(r => r.data === chave);
        horas.push(reg ? reg.horas : 0);
        qualidades.push(reg ? reg.qualidade : 0);
    }

    chartMiniSemana = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: dias,
            datasets: [
                {
                    label: 'Horas dormidas',
                    data: horas,
                    backgroundColor: horas.map(h => h >= meta ? 'rgba(67,233,123,0.7)' : 'rgba(102,126,234,0.7)'),
                    borderColor:     horas.map(h => h >= meta ? '#43e97b' : '#667eea'),
                    borderWidth: 2, borderRadius: 6,
                },
                {
                    label: `Meta (${meta}h)`,
                    data: Array(7).fill(meta),
                    type: 'line',
                    borderColor: '#f6d365',
                    borderDash: [5, 5],
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: false,
                }
            ]
        },
        options: {
            responsive: true,
            plugins: { legend: { labels: { color: '#ccc', font: { size: 11 } } } },
            scales: {
                y: { beginAtZero: true, max: 12, ticks: { color: '#aaa', callback: v => v + 'h' }, grid: { color: 'rgba(255,255,255,0.06)' } },
                x: { ticks: { color: '#aaa' }, grid: { display: false } }
            }
        }
    });
}

// ======================================================
// ABA: REGISTROS
// ======================================================
function renderRegistros() {
    const el = document.getElementById('listaRegistros');
    if (registrosSono.length === 0) {
        el.innerHTML = '<div class="empty-state"><i class="fas fa-bed" style="font-size:2.5rem;opacity:0.3;"></i><p>Nenhum registro ainda.</p><button class="btn btn-primary btn-sm" onclick="abrirRegistrarSono()"><i class="fas fa-plus"></i> Registrar Sono</button></div>';
        return;
    }
    el.innerHTML = registrosSono.map(r => {
        const corQ = getCorQualidade(r.qualidade);
        const metaOk = r.horas >= metaHoras;
        return `
        <div class="registro-card">
            <div class="registro-header">
                <div class="registro-data">
                    <span class="reg-data-txt">${formatarData(r.data)}</span>
                    <span class="reg-horario">${r.dormiu} → ${r.acordou}</span>
                </div>
                <div class="registro-badges">
                    <span class="reg-horas" style="color:${metaOk ? '#43e97b' : '#e74c3c'}">${formatarHoras(r.horas)}</span>
                    ${r.qualidade ? `<span class="reg-qualidade" style="background:${corQ}22;color:${corQ}">★ ${getLabelQualidade(r.qualidade)}</span>` : ''}
                    ${r.humor.emoji ? `<span class="reg-humor">${r.humor.emoji}</span>` : ''}
                </div>
            </div>
            ${r.fatores?.length ? `<div class="fatores-tags">${r.fatores.map(f=>`<span class="fator-tag">${f}</span>`).join('')}</div>` : ''}
            ${r.obs ? `<p class="noite-obs"><i class="fas fa-comment"></i> ${r.obs}</p>` : ''}
            <button class="btn-remover" onclick="removerSono('${r.id}')"><i class="fas fa-trash"></i></button>
        </div>`;
    }).join('');
}

function removerSono(id) {
    if (!confirm('Remover este registro de sono?')) return;
    registrosSono = registrosSono.filter(r => r.id !== id);
    salvarDados();
    renderRegistros();
    renderVisaoGeral();
    mostrarToast('Registro removido.', 'info');
}

// ======================================================
// ABA: DIÁRIO DE SONHOS
// ======================================================
function filtrarSonhos(tipo, btn) {
    document.querySelectorAll('.filtros-sonho .filtro-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderSonhos(tipo);
}

function renderSonhos(filtro) {
    const el = document.getElementById('listaSonhos');
    let lista = registrosSonho;
    if (filtro !== 'todos') lista = registrosSonho.filter(s => s.tipo === filtro);

    if (lista.length === 0) {
        el.innerHTML = `<div class="empty-state"><i class="fas fa-cloud-moon-rain" style="font-size:2.5rem;opacity:0.3;"></i><p>Nenhum sonho encontrado.</p><button class="btn btn-primary btn-roxo btn-sm" onclick="abrirRegistrarSonho()"><i class="fas fa-plus"></i> Registrar Sonho</button></div>`;
        return;
    }

    const corTipo = { normal: '#a18cd1', lucido: '#f6d365', pesadelo: '#e74c3c', recorrente: '#4facfe' };

    el.innerHTML = lista.map(s => {
        const cor = corTipo[s.tipo] || '#a18cd1';
        const clarezaLabel = ['', '🌫️ Muito vago', '🌁 Vago', '🌤️ Médio', '☀️ Nítido', '✨ Muito nítido'][s.clareza] || '';
        return `
        <div class="sonho-card" onclick="verDetalheSonho('${s.id}')" style="border-left-color:${cor}">
            <div class="sonho-header">
                <div>
                    <span class="sonho-tipo" style="color:${cor}">${getIconeTipo(s.tipo)} ${s.tipo.charAt(0).toUpperCase()+s.tipo.slice(1)}</span>
                    <h4 class="sonho-titulo">${s.titulo}</h4>
                </div>
                <div class="sonho-meta">
                    <span class="sonho-data">${formatarData(s.data)}</span>
                    <button class="btn-remover btn-remover-sm" onclick="event.stopPropagation();removerSonho('${s.id}')"><i class="fas fa-trash"></i></button>
                </div>
            </div>
            <p class="sonho-preview">${s.descricao.substring(0, 120)}${s.descricao.length > 120 ? '...' : ''}</p>
            <div class="sonho-footer">
                <span class="sonho-clareza">${clarezaLabel}</span>
                ${s.emocoes?.length ? `<div class="sonho-emocoes">${s.emocoes.slice(0,4).map(e => `<span class="emocao-tag">${e}</span>`).join('')}</div>` : ''}
                ${s.tags?.length ? `<div class="sonho-tags">${s.tags.slice(0,4).map(t=>`<span class="tag-sonho">#${t}</span>`).join('')}</div>` : ''}
            </div>
        </div>`;
    }).join('');
}

function verDetalheSonho(id) {
    const s = registrosSonho.find(x => x.id === id);
    if (!s) return;
    const corTipo = { normal: '#a18cd1', lucido: '#f6d365', pesadelo: '#e74c3c', recorrente: '#4facfe' };
    const cor = corTipo[s.tipo] || '#a18cd1';
    const clarezaLabel = ['', 'Muito vago', 'Vago', 'Médio', 'Nítido', 'Muito nítido'][s.clareza] || '';
    document.getElementById('detalheSonhoConteudo').innerHTML = `
        <div class="detalhe-sonho-header" style="border-bottom:2px solid ${cor}33;padding-bottom:16px;margin-bottom:20px;">
            <span class="sonho-tipo" style="color:${cor};font-size:1rem;">${getIconeTipo(s.tipo)} ${s.tipo.charAt(0).toUpperCase()+s.tipo.slice(1)}</span>
            <h2 style="margin:8px 0;color:#fff;">${s.titulo}</h2>
            <span style="color:rgba(255,255,255,0.5);font-size:0.85rem;">${formatarData(s.data)}</span>
        </div>
        <p style="line-height:1.8;color:rgba(255,255,255,0.85);white-space:pre-wrap;margin-bottom:20px;">${s.descricao}</p>
        ${s.emocoes?.length ? `<div style="margin-bottom:12px;"><strong style="color:rgba(255,255,255,0.6);font-size:0.8rem;">EMOÇÕES</strong><div class="sonho-emocoes" style="margin-top:6px;">${s.emocoes.map(e=>`<span class="emocao-tag">${e}</span>`).join('')}</div></div>` : ''}
        ${s.tags?.length ? `<div style="margin-bottom:12px;"><strong style="color:rgba(255,255,255,0.6);font-size:0.8rem;">TAGS</strong><div style="margin-top:6px;">${s.tags.map(t=>`<span class="tag-sonho">#${t}</span>`).join('')}</div></div>` : ''}
        <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:8px;">
            <span style="color:rgba(255,255,255,0.5);font-size:0.82rem;"><i class="fas fa-eye"></i> Clareza: ${clarezaLabel}</span>
        </div>
    `;
    abrirModal('modalDetalheSonho');
}

function removerSonho(id) {
    if (!confirm('Remover este sonho do diário?')) return;
    registrosSonho = registrosSonho.filter(s => s.id !== id);
    salvarDados();
    renderSonhos('todos');
    atualizarStatsMini();
    mostrarToast('Sonho removido.', 'info');
}

// ======================================================
// ABA: ESTATÍSTICAS
// ======================================================
function renderEstatisticas() {
    const total = registrosSono.reduce((a, r) => a + r.horas, 0);
    const media = registrosSono.length ? total / registrosSono.length : 0;
    const comQ  = registrosSono.filter(r => r.qualidade > 0);
    const mediaQ = comQ.length ? comQ.reduce((a, r) => a + r.qualidade, 0) / comQ.length : 0;

    document.getElementById('statTotalHoras').textContent       = formatarHoras(total);
    document.getElementById('statMediaHoras').textContent       = formatarHoras(media);
    document.getElementById('statQualidadeMedia').textContent   = mediaQ ? mediaQ.toFixed(1) + ' ⭐' : '--';
    document.getElementById('statDiasRegistrados').textContent  = registrosSono.length;

    renderChartHoras();
    renderChartQualidade();
    renderChartHorario();
    renderChartTiposSonho();
    renderAnaliseImpactos();
    renderAnaliseHumor();
}

function destroyChart(ref) { if (ref) { ref.destroy(); } return null; }

function renderChartHoras() {
    const ctx = document.getElementById('chartHoras')?.getContext('2d');
    if (!ctx) return;
    chartHoras = destroyChart(chartHoras);

    const dias = [], horas = [];
    for (let i = 13; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const chave = d.toISOString().split('T')[0];
        const [, m, dia] = chave.split('-');
        dias.push(`${dia}/${m}`);
        const reg = registrosSono.find(r => r.data === chave);
        horas.push(reg ? reg.horas : null);
    }

    chartHoras = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dias,
            datasets: [{
                label: 'Horas dormidas',
                data: horas,
                borderColor: '#667eea',
                backgroundColor: 'rgba(102,126,234,0.15)',
                fill: true, tension: 0.4, pointRadius: 4,
                pointBackgroundColor: horas.map(h => h === null ? 'transparent' : h >= metaHoras ? '#43e97b' : '#e74c3c'),
                spanGaps: false,
            }, {
                label: `Meta (${metaHoras}h)`,
                data: Array(14).fill(metaHoras),
                borderColor: '#f6d365', borderDash: [6, 4], borderWidth: 2, pointRadius: 0, fill: false,
            }]
        },
        options: { responsive: true, plugins: { legend: { labels: { color: '#ccc' } } }, scales: { y: { beginAtZero: true, max: 12, ticks: { color: '#aaa', callback: v => v + 'h' }, grid: { color: 'rgba(255,255,255,0.06)' } }, x: { ticks: { color: '#aaa' }, grid: { display: false } } } }
    });
}

function renderChartQualidade() {
    const ctx = document.getElementById('chartQualidade')?.getContext('2d');
    if (!ctx) return;
    chartQualidade = destroyChart(chartQualidade);
    const contagem = [0, 0, 0, 0, 0];
    registrosSono.forEach(r => { if (r.qualidade >= 1 && r.qualidade <= 5) contagem[r.qualidade - 1]++; });
    chartQualidade = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Muito ruim', 'Ruim', 'Regular', 'Boa', 'Excelente'],
            datasets: [{ data: contagem, backgroundColor: ['#e74c3c','#e67e22','#f1c40f','#2ecc71','#27ae60'], borderWidth: 0 }]
        },
        options: { responsive: true, plugins: { legend: { labels: { color: '#ccc' } } } }
    });
}

function renderChartHorario() {
    const ctx = document.getElementById('chartHorario')?.getContext('2d');
    if (!ctx) return;
    chartHorario = destroyChart(chartHorario);
    const horarios = Array(24).fill(0);
    registrosSono.forEach(r => {
        if (r.dormiu) { const h = parseInt(r.dormiu.split(':')[0]); horarios[h]++; }
    });
    const labels = Array.from({length: 24}, (_, i) => i + 'h');
    chartHorario = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Vezes que dormiu', data: horarios, backgroundColor: 'rgba(161,140,209,0.7)', borderColor: '#a18cd1', borderWidth: 1, borderRadius: 4 }] },
        options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { color: '#aaa', stepSize: 1 }, grid: { color: 'rgba(255,255,255,0.06)' } }, x: { ticks: { color: '#aaa', maxTicksLimit: 12 }, grid: { display: false } } } }
    });
}

function renderChartTiposSonho() {
    const ctx = document.getElementById('chartTiposSonho')?.getContext('2d');
    if (!ctx) return;
    chartTiposSonho = destroyChart(chartTiposSonho);
    const tipos = { normal: 0, lucido: 0, pesadelo: 0, recorrente: 0 };
    registrosSonho.forEach(s => { if (tipos.hasOwnProperty(s.tipo)) tipos[s.tipo]++; });
    chartTiposSonho = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: ['💭 Normal', '✨ Lúcido', '😱 Pesadelo', '🔄 Recorrente'],
            datasets: [{ data: Object.values(tipos), backgroundColor: ['#a18cd1','#f6d365','#e74c3c','#4facfe'], borderWidth: 0 }]
        },
        options: { responsive: true, plugins: { legend: { labels: { color: '#ccc' } } } }
    });
}

function renderAnaliseImpactos() {
    const el = document.getElementById('analiseImpactos');
    const fatoresList = ['cafeina','alcool','exercicio','tela','estresse','meditacao'];
    const emojisFatores = { cafeina: '☕', alcool: '🍷', exercicio: '🏃', tela: '📱', estresse: '😰', meditacao: '🧘' };

    const resultado = fatoresList.map(f => {
        const com   = registrosSono.filter(r => r.fatores?.includes(f) && r.qualidade > 0);
        const semF  = registrosSono.filter(r => !r.fatores?.includes(f) && r.qualidade > 0);
        const mediaCom = com.length ? com.reduce((a, r) => a + r.qualidade, 0) / com.length : null;
        const mediaSem = semF.length ? semF.reduce((a, r) => a + r.qualidade, 0) / semF.length : null;
        return { fator: f, emoji: emojisFatores[f], mediaCom, mediaSem, ocorrencias: com.length };
    }).filter(x => x.ocorrencias > 0);

    if (resultado.length === 0) {
        el.innerHTML = '<p style="color:rgba(255,255,255,0.4);text-align:center;padding:20px;">Registre mais noites com fatores para ver o impacto.</p>';
        return;
    }

    el.innerHTML = resultado.map(x => {
        const delta = x.mediaCom !== null && x.mediaSem !== null ? (x.mediaCom - x.mediaSem).toFixed(1) : null;
        const cor = delta === null ? '#888' : parseFloat(delta) > 0 ? '#2ecc71' : parseFloat(delta) < 0 ? '#e74c3c' : '#888';
        const sinal = delta === null ? '' : parseFloat(delta) > 0 ? '+' : '';
        return `
        <div class="impacto-item">
            <span class="impacto-emoji">${x.emoji}</span>
            <div class="impacto-info">
                <strong>${x.fator}</strong>
                <small>${x.ocorrencias} noite(s) registrada(s)</small>
            </div>
            <div class="impacto-valor" style="color:${cor}">
                ${delta !== null ? sinal + delta + ' pts' : 'poucos dados'}
            </div>
        </div>`;
    }).join('');
}

function renderAnaliseHumor() {
    const el = document.getElementById('analiseHumor');
    const humores = {};
    registrosSono.forEach(r => {
        if (r.humor?.label) {
            if (!humores[r.humor.label]) humores[r.humor.label] = { emoji: r.humor.emoji, count: 0, somaQ: 0 };
            humores[r.humor.label].count++;
            humores[r.humor.label].somaQ += r.qualidade || 0;
        }
    });

    if (Object.keys(humores).length === 0) {
        el.innerHTML = '<p style="color:rgba(255,255,255,0.4);text-align:center;padding:20px;">Registre humor ao acordar para ver a análise.</p>';
        return;
    }

    el.innerHTML = Object.entries(humores).map(([label, d]) => {
        const pct = Math.round((d.count / registrosSono.length) * 100);
        return `
        <div class="humor-stat-item">
            <span style="font-size:1.4rem;">${d.emoji}</span>
            <div style="flex:1;">
                <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                    <strong>${label}</strong><span style="color:rgba(255,255,255,0.5)">${d.count}x (${pct}%)</span>
                </div>
                <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${pct}%;background:linear-gradient(90deg,#667eea,#764ba2)"></div></div>
            </div>
        </div>`;
    }).join('');
}

// ======================================================
// ABA: METAS & DICAS
// ======================================================
function atualizarMetaHoras(val) {
    document.getElementById('metaHorasValor').textContent = parseFloat(val) % 1 === 0 ? val + 'h' : val + 'h';
}

function salvarMetaHoras() {
    metaHoras = parseFloat(document.getElementById('metaHorasSlider').value);
    localStorage.setItem('st_metaHoras', metaHoras);
    mostrarToast(`Meta definida: ${metaHoras}h por noite ✅`, 'sucesso');
    renderMetas();
}

function renderMetas() {
    document.getElementById('metaHorasSlider').value = metaHoras;
    atualizarMetaHoras(metaHoras);
    renderMetaProgressoSemana();
    renderBemEstar();
    renderDicasPersonalizadas();
}

function renderMetaProgressoSemana() {
    const el = document.getElementById('metaProgressoSemana');
    const html = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const chave = d.toISOString().split('T')[0];
        const [, m, dia] = chave.split('-');
        const reg = registrosSono.find(r => r.data === chave);
        const atingiu = reg && reg.horas >= metaHoras;
        const pct = reg ? Math.min(Math.round((reg.horas / metaHoras) * 100), 100) : 0;
        html.push(`
            <div class="meta-dia">
                <div class="meta-dia-barra-wrap">
                    <div class="meta-dia-barra" style="height:${pct}%;background:${atingiu ? 'linear-gradient(180deg,#43e97b,#38f9d7)' : 'linear-gradient(180deg,#667eea,#764ba2)'}"></div>
                </div>
                <span class="meta-dia-label" style="color:${reg ? '#fff' : 'rgba(255,255,255,0.3)'}">${dia}/${m}</span>
                <span style="font-size:0.65rem;color:${atingiu ? '#43e97b' : 'rgba(255,255,255,0.4)'};">${reg ? formatarHoras(reg.horas) : '--'}</span>
            </div>`);
    }
    el.innerHTML = `<div class="meta-semana-grid">${html.join('')}</div>`;
}

function renderBemEstar() {
    if (registrosSono.length < 3) return;

    const ultimos7 = registrosSono.slice(0, 7);
    const mediaH = ultimos7.reduce((a, r) => a + r.horas, 0) / ultimos7.length;
    const comQ = ultimos7.filter(r => r.qualidade > 0);
    const mediaQ = comQ.length ? comQ.reduce((a, r) => a + r.qualidade, 0) / comQ.length : 3;
    const seq = calcularSequencia();
    const metaAtingida = ultimos7.filter(r => r.horas >= metaHoras).length / ultimos7.length;

    let score = Math.round(
        (Math.min(mediaH / 8, 1.2) * 35) +
        ((mediaQ / 5) * 35) +
        (metaAtingida * 20) +
        (Math.min(seq / 7, 1) * 10)
    );
    score = Math.min(score, 100);

    const circumference = 326.73;
    const offset = circumference - (score / 100) * circumference;
    const circulo = document.getElementById('beCirculo');
    if (circulo) { circulo.style.strokeDashoffset = offset; circulo.style.stroke = score >= 70 ? '#43e97b' : score >= 40 ? '#f6d365' : '#e74c3c'; }

    document.getElementById('beScore').textContent = score;
    const descricoes = [
        { min: 80, txt: '🌟 Excelente! Seu sono está muito saudável. Continue assim!', cor: '#43e97b' },
        { min: 60, txt: '😊 Bom sono! Pequenos ajustes podem levar ao nível excelente.', cor: '#2ecc71' },
        { min: 40, txt: '😐 Sono razoável. Verifique as dicas abaixo para melhorar.', cor: '#f6d365' },
        { min: 20, txt: '😕 Sono abaixo do ideal. Tente consistência de horários e evite fatores prejudiciais.', cor: '#e67e22' },
        { min:  0, txt: '😟 Sono crítico. Considere consultar um médico especialista em sono.', cor: '#e74c3c' },
    ];
    const desc = descricoes.find(d => score >= d.min) || descricoes[descricoes.length - 1];
    const descEl = document.getElementById('beDescricao');
    if (descEl) { descEl.textContent = desc.txt; descEl.style.color = desc.cor; }
}

function renderDicasPersonalizadas() {
    const el = document.getElementById('dicasPersonalizadas');
    const dicas = [];

    if (registrosSono.length < 3) {
        el.innerHTML = '<p style="color:rgba(255,255,255,0.4);text-align:center;padding:20px;">Registre pelo menos 3 noites para receber dicas personalizadas.</p>';
        return;
    }

    const ultimos7 = registrosSono.slice(0, 7);
    const mediaH = ultimos7.reduce((a, r) => a + r.horas, 0) / ultimos7.length;
    const comQ = ultimos7.filter(r => r.qualidade > 0);
    const mediaQ = comQ.length ? comQ.reduce((a, r) => a + r.qualidade, 0) / comQ.length : 0;

    if (mediaH < metaHoras - 1) dicas.push({ icon: '⏰', titulo: 'Durma mais cedo', msg: `Sua média é ${formatarHoras(mediaH)}, abaixo da sua meta de ${metaHoras}h. Tente deitar ${Math.round(metaHoras - mediaH)}h mais cedo.` });
    if (mediaQ < 3 && mediaQ > 0) dicas.push({ icon: '🌙', titulo: 'Melhore a qualidade', msg: 'Sua qualidade média está abaixo de 3. Revise fatores como tela, cafeína e estresse antes de dormir.' });

    const comCafeina = ultimos7.filter(r => r.fatores?.includes('cafeina'));
    if (comCafeina.length >= 3) {
        const mQC = comCafeina.reduce((a,r) => a+(r.qualidade||3), 0) / comCafeina.length;
        if (mQC < mediaQ) dicas.push({ icon: '☕', titulo: 'Reduza a cafeína', msg: 'Suas noites com cafeína têm qualidade menor. Tente cortar café após as 14h.' });
    }

    const comTela = ultimos7.filter(r => r.fatores?.includes('tela'));
    if (comTela.length >= 3) dicas.push({ icon: '📵', titulo: 'Limite o uso de telas', msg: 'Você usou telas em ' + comTela.length + ' noites esta semana. A luz azul atrasa o sono.' });

    const comEstresse = ultimos7.filter(r => r.fatores?.includes('estresse'));
    if (comEstresse.length >= 2) dicas.push({ icon: '🧘', titulo: 'Gerencie o estresse', msg: 'O estresse aparece frequentemente. Tente meditação, respiração ou journaling antes de dormir.' });

    const semExercicio = ultimos7.filter(r => !r.fatores?.includes('exercicio'));
    if (semExercicio.length >= 5) dicas.push({ icon: '🏃', titulo: 'Pratique exercícios', msg: 'Exercícios regulares melhoram significativamente a qualidade do sono. Tente 30 min por dia.' });

    if (registrosSonho.length === 0) dicas.push({ icon: '📓', titulo: 'Registre seus sonhos', msg: 'Manter um diário de sonhos melhora a memória onírica e o autoconhecimento.' });

    const seq = calcularSequencia();
    if (seq === 0) dicas.push({ icon: '📅', titulo: 'Seja consistente', msg: 'Registre seu sono diariamente para obter análises mais precisas e insights personalizados.' });

    if (dicas.length === 0) dicas.push({ icon: '🌟', titulo: 'Parabéns!', msg: 'Seu sono está muito bem! Continue mantendo seus hábitos saudáveis.' });

    el.innerHTML = dicas.map(d => `
        <div class="dica-item">
            <span class="dica-icon">${d.icon}</span>
            <div><strong>${d.titulo}</strong><p>${d.msg}</p></div>
        </div>`).join('');
}

// ======================================================
// TOAST
// ======================================================
let toastTimer = null;
function mostrarToast(msg, tipo = 'sucesso') {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast toast-' + tipo + ' show';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
}

// ======================================================
// INIT
// ======================================================
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('dataSono').value  = new Date().toISOString().split('T')[0];
    document.getElementById('sonhoData').value = new Date().toISOString().split('T')[0];
    document.getElementById('metaHorasSlider').value = metaHoras;
    renderVisaoGeral();
});

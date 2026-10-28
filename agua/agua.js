// ======================================================
// HidratAção — agua.js
// ======================================================

// ── Estado global ────────────────────────────────────
let usuario       = JSON.parse(localStorage.getItem('usuario'))       || {};
let historico     = JSON.parse(localStorage.getItem('historicoAgua')) || [];
let metaDiaria    = parseInt(localStorage.getItem('metaDiaria'))      || 0;
let consumidoHoje = 0;
let mlSelecionado = 200;   // copo padrão
let ultimoAdd     = 0;     // para "desfazer"
let progressChart = null;
let historicoChart= null;
let histChartMode = 'bar';
let reminders     = JSON.parse(localStorage.getItem('reminders')) || [];
let reminderTimers= [];

// ── Seções ────────────────────────────────────────────
function showSection(id) {
    document.querySelectorAll('.content').forEach(c => c.classList.remove('active'));
    document.getElementById(id).classList.add('active');

    // Destaque no nav
    ['navCadastro','navMeta','navHistorico'].forEach(b => {
        const el = document.getElementById(b);
        el.classList.remove('btn-primary');
        el.classList.add('btn-secondary');
    });
    const map = { cadastro:'navCadastro', meta:'navMeta', historico:'navHistorico' };
    const active = document.getElementById(map[id]);
    active.classList.remove('btn-secondary');
    active.classList.add('btn-primary');

    if (id === 'meta')      { carregarMeta(); renderReminders(); }
    if (id === 'historico') { atualizarHistorico(); renderWeekCalendar(); }
}

// ── CADASTRO ──────────────────────────────────────────
document.getElementById('cadastroForm').addEventListener('submit', function(e) {
    e.preventDefault();

    const peso     = parseFloat(document.getElementById('peso').value);
    const idade    = parseInt(document.getElementById('idade').value);
    const alturaM  = parseFloat(document.getElementById('altura').value);   // já em metros
    const genero   = document.getElementById('genero').value;
    const atividade= parseFloat(document.getElementById('atividade').value);

    // Validação de altura em metros
    if (alturaM < 0.5 || alturaM > 2.5) {
        alert('⚠️ Informe a altura em metros (ex: 1.75). Valores aceitos: 0.50 a 2.50 m');
        return;
    }

    usuario = { peso, idade, alturaM, genero, atividade };
    metaDiaria = Math.round(peso * 35 * atividade);

    document.getElementById('metaDiaria').textContent = metaDiaria;
    document.getElementById('resultadoMeta').style.display = 'block';

    localStorage.setItem('usuario',    JSON.stringify(usuario));
    localStorage.setItem('metaDiaria', metaDiaria);
});

// Preencher form se já cadastrado
function preencherFormCadastro() {
    if (!usuario.peso) return;
    document.getElementById('peso').value      = usuario.peso;
    document.getElementById('idade').value     = usuario.idade;
    document.getElementById('altura').value    = usuario.alturaM;
    document.getElementById('genero').value    = usuario.genero;
    document.getElementById('atividade').value = usuario.atividade || 1.2;
}

// ── META DIÁRIA ────────────────────────────────────────
function carregarMeta() {
    const savedMeta = localStorage.getItem('metaDiaria');
    if (savedMeta) metaDiaria = parseInt(savedMeta);

    document.getElementById('metaHoje').textContent = metaDiaria;

    // Barra de info do usuário
    if (usuario.peso) {
        const bar = document.getElementById('userInfoBar');
        const imc = (usuario.peso / (usuario.alturaM * usuario.alturaM)).toFixed(1);
        document.getElementById('userInfoText').textContent =
            `${usuario.peso}kg · ${usuario.alturaM}m · IMC ${imc} · Meta ${metaDiaria}ml`;
        bar.style.display = 'flex';
    }

    // Consumo do dia
    const hoje      = dataHoje();
    const diaGuardado = localStorage.getItem('consumidoData');
    if (diaGuardado === hoje) {
        consumidoHoje = parseInt(localStorage.getItem('consumidoHoje')) || 0;
    } else {
        consumidoHoje = 0;
        localStorage.setItem('consumidoHoje', 0);
        localStorage.setItem('consumidoData', hoje);
    }
    document.getElementById('consumidoHoje').textContent = consumidoHoje;
    atualizarProgresso();
}

// ── SELEÇÃO DE COPO ───────────────────────────────────
function selectCup(btn, ml) {
    document.querySelectorAll('.cup-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    mlSelecionado = ml;

    const customInput = document.getElementById('customInput');
    if (ml === 0) {
        customInput.style.display = 'block';
        document.getElementById('customMl').focus();
    } else {
        customInput.style.display = 'none';
    }
}

// ── ADICIONAR ÁGUA ────────────────────────────────────
function addAgua() {
    let ml = mlSelecionado;
    if (ml === 0) {
        ml = parseInt(document.getElementById('customMl').value) || 0;
    }
    if (ml <= 0) { alert('Informe uma quantidade válida!'); return; }

    ultimoAdd = ml;
    consumidoHoje += ml;

    localStorage.setItem('consumidoHoje', consumidoHoje);
    localStorage.setItem('consumidoData', dataHoje());

    document.getElementById('consumidoHoje').textContent = consumidoHoje;
    atualizarProgresso();

    // Mini feedback visual
    showToast(`+${ml} ml adicionados 💧`);
}

// ── DESFAZER ÚLTIMO ───────────────────────────────────
function desfazerUltimo() {
    if (ultimoAdd === 0) { showToast('Nada para desfazer'); return; }
    consumidoHoje = Math.max(0, consumidoHoje - ultimoAdd);
    showToast(`-${ultimoAdd} ml removidos`);
    ultimoAdd = 0;
    localStorage.setItem('consumidoHoje', consumidoHoje);
    document.getElementById('consumidoHoje').textContent = consumidoHoje;
    atualizarProgresso();
}

// ── PROGRESSO (DONUT) ─────────────────────────────────
function atualizarProgresso() {
    const ctx       = document.getElementById('progressChart').getContext('2d');
    const pct       = metaDiaria > 0 ? Math.min((consumidoHoje / metaDiaria) * 100, 100) : 0;
    const pctRound  = Math.round(pct);

    // Atualiza texto central
    document.getElementById('donutPercent').textContent = pctRound + '%';

    // Cor dinâmica baseada no progresso
    let fillColor;
    if (pct < 30)       fillColor = '#f87171';
    else if (pct < 60)  fillColor = '#fbbf24';
    else if (pct < 100) fillColor = '#4facfe';
    else                fillColor = '#22c55e';

    if (progressChart) progressChart.destroy();

    progressChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            datasets: [{
                data: [pct, 100 - pct],
                backgroundColor: [fillColor, '#e8f0fe'],
                borderWidth: 0,
                hoverOffset: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '78%',
            animation: { animateRotate: true, duration: 600 },
            plugins: {
                legend:  { display: false },
                tooltip: { enabled: false }
            }
        }
    });

    // Cor do texto central
    document.getElementById('donutPercent').style.color = fillColor;
}

// ── FINALIZAR DIA ─────────────────────────────────────
function finalizarDia() {
    if (metaDiaria === 0) { alert('⚠️ Faça o cadastro primeiro!'); return; }

    const data      = dataHoje();
    const completou = consumidoHoje >= metaDiaria;
    const percentual= metaDiaria > 0 ? Math.round((consumidoHoje / metaDiaria) * 100) : 0;

    const jaReg = historico.find(h => h.data === data);
    if (jaReg) {
        jaReg.consumido  = consumidoHoje;
        jaReg.completou  = completou;
        jaReg.percentual = percentual;
    } else {
        historico.unshift({ data, meta: metaDiaria, consumido: consumidoHoje, completou, percentual });
    }

    localStorage.setItem('historicoAgua', JSON.stringify(historico));

    // Zera consumo
    consumidoHoje = 0;
    ultimoAdd = 0;
    localStorage.setItem('consumidoHoje', 0);
    document.getElementById('consumidoHoje').textContent = '0';
    atualizarProgresso();

    const msg = completou
        ? '🎉 Parabéns! Você bateu a meta hoje!'
        : `📈 Bom esforço! Você chegou a ${percentual}% da meta.`;
    showToast(msg, 3500);
}

// ── HISTÓRICO ─────────────────────────────────────────
function atualizarHistorico() {
    const ultimos = historico.slice(0, 30);

    // Stats
    document.getElementById('totalDias').textContent    = historico.length;
    const diasCompletos = historico.filter(d => d.completou).length;
    document.getElementById('diasCompletos').textContent = diasCompletos;
    const taxa = historico.length > 0 ? Math.round((diasCompletos / historico.length) * 100) : 0;
    document.getElementById('taxaSucesso').textContent   = taxa + '%';

    // Sequência atual
    let seq = 0;
    for (let i = 0; i < historico.length; i++) {
        if (historico[i].completou) seq++;
        else break;
    }
    document.getElementById('sequenciaAtual').textContent = seq;

    // Renderiza gráfico no modo atual
    renderHistChart(histChartMode, ultimos);

    // Lista
    renderHistoricoLista(ultimos);
}

function switchHistChart(mode, btn) {
    histChartMode = mode;
    document.querySelectorAll('.chart-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const ultimos = historico.slice(0, 30);
    renderHistChart(mode, ultimos);
}

function renderHistChart(mode, ultimos) {
    const ctx = document.getElementById('historicoChart').getContext('2d');
    if (historicoChart) historicoChart.destroy();

    if (mode === 'week') {
        // Gráfico dos últimos 7 dias da semana com nomes
        const semana = getLastNDays(7);
        const labels = semana.map(d => diaNome(d));
        const dataBar = semana.map(d => {
            const reg = historico.find(h => h.data === d);
            return reg ? reg.consumido : 0;
        });
        const metas = semana.map(d => {
            const reg = historico.find(h => h.data === d);
            return reg ? reg.meta : (metaDiaria || 0);
        });
        const bgColors = semana.map(d => {
            const reg = historico.find(h => h.data === d);
            if (!reg) return 'rgba(200,210,220,0.5)';
            return reg.completou ? 'rgba(67,233,123,0.8)' : 'rgba(248,113,113,0.8)';
        });

        historicoChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Consumido (ml)',
                        data: dataBar,
                        backgroundColor: bgColors,
                        borderRadius: 10,
                        borderSkipped: false,
                    },
                    {
                        label: 'Meta (ml)',
                        data: metas,
                        type: 'line',
                        borderColor: '#4facfe',
                        borderDash: [6, 3],
                        borderWidth: 2,
                        pointRadius: 0,
                        fill: false,
                    }
                ]
            },
            options: chartOptions('Últimos 7 dias')
        });
        return;
    }

    const labels  = ultimos.map(d => formatDateShort(d.data)).reverse();
    const consumed= ultimos.map(d => d.consumido).reverse();
    const metas   = ultimos.map(d => d.meta).reverse();

    if (mode === 'bar') {
        const bgColors = ultimos.map(d => d.completou ? 'rgba(67,233,123,0.8)' : 'rgba(248,113,113,0.8)').reverse();
        historicoChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Consumido (ml)',
                        data: consumed,
                        backgroundColor: bgColors,
                        borderRadius: 8,
                        borderSkipped: false
                    },
                    {
                        label: 'Meta (ml)',
                        data: metas,
                        type: 'line',
                        borderColor: '#4facfe',
                        borderDash: [6, 3],
                        borderWidth: 2,
                        pointRadius: 0,
                        fill: false
                    }
                ]
            },
            options: chartOptions('Consumo vs Meta')
        });
    } else {
        // line
        historicoChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Meta (ml)',
                        data: metas,
                        borderColor: '#4facfe',
                        backgroundColor: 'rgba(79,172,254,0.08)',
                        fill: true,
                        tension: 0.4,
                        borderWidth: 2,
                        pointRadius: 4,
                        pointBackgroundColor: '#4facfe'
                    },
                    {
                        label: 'Consumido (ml)',
                        data: consumed,
                        borderColor: '#43e97b',
                        backgroundColor: 'rgba(67,233,123,0.08)',
                        fill: true,
                        tension: 0.4,
                        borderWidth: 2,
                        pointRadius: 4,
                        pointBackgroundColor: '#43e97b'
                    }
                ]
            },
            options: chartOptions('Evolução da Hidratação')
        });
    }
}

function chartOptions(title) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { position: 'bottom', labels: { font: { family: 'Poppins', size: 11 }, usePointStyle: true, padding: 16 } },
            title:  { display: !!title, text: title, font: { family: 'Poppins', size: 13 }, color: '#555', padding: { bottom: 10 } }
        },
        scales: {
            x: { grid: { display: false }, ticks: { font: { family: 'Poppins', size: 10 } } },
            y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { family: 'Poppins', size: 10 } } }
        }
    };
}

function renderHistoricoLista(ultimos) {
    document.getElementById('historicoLista').innerHTML = ultimos.map(dia => {
        const pct = dia.percentual !== undefined ? dia.percentual : Math.round((dia.consumido / dia.meta) * 100);
        const cls = dia.completou ? 'done' : 'fail';
        return `
        <div class="history-item ${cls}">
            <div>
                <div class="history-date">${formatDateFull(dia.data)}</div>
                <div class="history-detail">Meta: ${dia.meta} ml &nbsp;·&nbsp; Consumido: ${dia.consumido} ml</div>
            </div>
            <span class="history-progress">${pct}% ${dia.completou ? '✅' : '❌'}</span>
        </div>`;
    }).join('') || '<p style="text-align:center;color:#aaa;padding:20px 0;">Nenhum registro ainda.</p>';
}

// ── CALENDÁRIO SEMANAL ────────────────────────────────
function renderWeekCalendar() {
    const semana = getLastNDays(7);
    const hoje   = dataHoje();
    const nomes  = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

    document.getElementById('weekDays').innerHTML = semana.map(d => {
        const dt   = new Date(d + 'T12:00:00');
        const nome = nomes[dt.getDay()];
        const num  = dt.getDate();
        const reg  = historico.find(h => h.data === d);

        let cls = 'week-day';
        let icon = '—';
        if (d === hoje) cls += ' today';
        if (reg) {
            cls += reg.completou ? ' completed' : ' failed';
            icon = reg.completou ? '✅' : '❌';
        }

        return `<div class="${cls}">
            <div class="day-name">${nome}</div>
            <div class="day-num">${num}</div>
            <div class="day-icon">${icon}</div>
        </div>`;
    }).join('');
}

// ── LIMPAR HISTÓRICO ──────────────────────────────────
function limparHistorico() {
    if (!confirm('Apagar todo o histórico?')) return;
    historico = [];
    localStorage.removeItem('historicoAgua');
    atualizarHistorico();
    renderWeekCalendar();
}

// ── LEMBRETES ─────────────────────────────────────────
function addReminder() {
    const time = document.getElementById('reminderTime').value;
    const freq = document.getElementById('reminderFreq').value;
    if (!time) { alert('Informe um horário!'); return; }

    solicitarPermissaoNotificacao().then(ok => {
        const r = { id: Date.now(), time, freq };
        reminders.push(r);
        localStorage.setItem('reminders', JSON.stringify(reminders));
        renderReminders();
        agendarReminder(r);
        if (ok) {
            document.getElementById('notifStatus').textContent = '✅ Notificações ativas';
            document.getElementById('notifStatus').className = 'notif-status ok';
        }
    });
}

function removeReminder(id) {
    reminders = reminders.filter(r => r.id !== id);
    localStorage.setItem('reminders', JSON.stringify(reminders));
    renderReminders();
}

const freqLabel = { single:'Uma vez', '30min':'A cada 30 min', '1h':'A cada 1h', '2h':'A cada 2h' };

function renderReminders() {
    const lista = document.getElementById('remindersList');
    if (!reminders.length) {
        lista.innerHTML = '<p style="font-size:0.82em;color:#aaa;text-align:center;padding:8px 0;">Nenhum lembrete configurado.</p>';
        return;
    }
    lista.innerHTML = reminders.map(r => `
        <div class="reminder-item">
            <div class="reminder-info">
                <span class="reminder-time"><i class="fas fa-clock"></i> ${r.time}</span>
                <span class="reminder-freq">${freqLabel[r.freq] || r.freq}</span>
            </div>
            <button class="reminder-del" onclick="removeReminder(${r.id})"><i class="fas fa-times"></i> Remover</button>
        </div>`).join('');
}

function agendarReminder(r) {
    const [h, m] = r.time.split(':').map(Number);
    const agora  = new Date();
    let proximo  = new Date();
    proximo.setHours(h, m, 0, 0);
    if (proximo <= agora) proximo.setDate(proximo.getDate() + 1);

    const delay  = proximo - agora;
    let intervalo= 0;
    if (r.freq === '30min') intervalo = 30 * 60 * 1000;
    if (r.freq === '1h')    intervalo = 60 * 60 * 1000;
    if (r.freq === '2h')    intervalo = 2 * 60 * 60 * 1000;

    setTimeout(() => {
        dispararNotificacao();
        if (intervalo > 0) {
            const t = setInterval(() => dispararNotificacao(), intervalo);
            reminderTimers.push(t);
        }
    }, delay);
}

function dispararNotificacao() {
    if (Notification.permission === 'granted') {
        new Notification('💧 HidratAção', {
            body: `Hora de beber água! Você já consumiu ${consumidoHoje} ml hoje.`,
            icon: '../imagem/agua.jpg'
        });
    }
}

async function solicitarPermissaoNotificacao() {
    const status = document.getElementById('notifStatus');
    if (!('Notification' in window)) {
        status.textContent = '⚠️ Seu navegador não suporta notificações';
        status.className = 'notif-status err';
        return false;
    }
    if (Notification.permission === 'granted') return true;
    const perm = await Notification.requestPermission();
    if (perm === 'granted') return true;
    status.textContent = '⚠️ Permissão negada — lembretes apenas visíveis nesta aba';
    status.className = 'notif-status err';
    return false;
}

// Reagendar lembretes salvos ao carregar
function reagendarLembretesSalvos() {
    reminders.forEach(r => agendarReminder(r));
}

// ── TOAST ─────────────────────────────────────────────
function showToast(msg, duration = 2200) {
    let t = document.getElementById('toastMsg');
    if (!t) {
        t = document.createElement('div');
        t.id = 'toastMsg';
        t.style.cssText = `
            position:fixed; bottom:24px; left:50%; transform:translateX(-50%);
            background:rgba(30,30,50,0.92); color:#fff;
            padding:12px 24px; border-radius:50px; font-family:'Poppins',sans-serif;
            font-size:0.9em; font-weight:600; z-index:9999;
            box-shadow:0 8px 24px rgba(0,0,0,0.25);
            transition: opacity 0.4s;
        `;
        document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = '1';
    clearTimeout(t._hide);
    t._hide = setTimeout(() => t.style.opacity = '0', duration);
}

// ── HELPERS ───────────────────────────────────────────
function dataHoje() {
    return new Date().toISOString().split('T')[0];
}

function getLastNDays(n) {
    const days = [];
    for (let i = n - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        days.push(d.toISOString().split('T')[0]);
    }
    return days;
}

function diaNome(isoDate) {
    const nomes = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
    const d = new Date(isoDate + 'T12:00:00');
    return nomes[d.getDay()];
}

function formatDateShort(isoDate) {
    const [, m, d] = isoDate.split('-');
    return `${d}/${m}`;
}

function formatDateFull(isoDate) {
    const [y, m, d] = isoDate.split('-');
    const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    return `${d} ${meses[parseInt(m) - 1]} ${y}`;
}

// ── INIT ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    preencherFormCadastro();
    reagendarLembretesSalvos();
    showSection('cadastro');

    // Se já tiver cadastro, mostra resultado
    if (usuario.peso) {
        document.getElementById('metaDiaria').textContent = metaDiaria;
        document.getElementById('resultadoMeta').style.display = 'block';
    }
});

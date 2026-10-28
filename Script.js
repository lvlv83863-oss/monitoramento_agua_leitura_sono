// ======================================================
// HabitTracker — Script.js  v2.0
// ======================================================

// ---- Partículas ----
function createParticles() {
    const container = document.getElementById('particles');
    if (!container) return;
    for (let i = 0; i < 50; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        p.style.left = Math.random() * 100 + '%';
        p.style.animationDelay = Math.random() * 15 + 's';
        p.style.animationDuration = (Math.random() * 10 + 10) + 's';
        container.appendChild(p);
    }
}

// ======================================================
// MODAIS DE AUTENTICAÇÃO
// ======================================================
function abrirModal(id) {
    document.getElementById(id).classList.add('active');
    document.body.style.overflow = 'hidden';
}
function fecharModal(id) {
    document.getElementById(id).classList.remove('active');
    document.body.style.overflow = '';
}
function trocarModal(fechar, abrir) {
    fecharModal(fechar);
    setTimeout(() => abrirModal(abrir), 200);
}

// Fechar overlay clicando fora
document.addEventListener('click', function(e) {
    ['modalLogin', 'modalCadastro', 'modalSobre'].forEach(id => {
        const el = document.getElementById(id);
        if (el && e.target === el) fecharModal(id);
    });
});

// ---- Botões do header ----
function showLogin()    { limparMsgs(); abrirModal('modalLogin'); }
function showRegister() { limparMsgs(); abrirModal('modalCadastro'); }
function showAbout()    { abrirModal('modalSobre'); }


// ---- Toast na home ----
function mostrarToastHome(msg, tipo) {
    let toast = document.getElementById('toastHome');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toastHome';
        toast.className = 'toast-home';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.className = 'toast-home toast-' + tipo + ' show';
    setTimeout(() => toast.classList.remove('show'), 3500);
}

// ---- Navegação ----
function goToWater()   { window.location.href = 'agua/agua.html'; }
function goToReading() { window.location.href = 'leitura/leitura.html'; }
function goToSleep()   { window.location.href = 'sonho/sonho.html'; }

// ---- Inicialização ----
document.addEventListener('DOMContentLoaded', function () {
    createParticles();
    atualizarHeaderUsuario();

    // Fechar modal com ESC
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            ['modalLogin','modalCadastro','modalSobre'].forEach(id => fecharModal(id));
        }
    });

    // Enter no campo de senha faz login
    const loginSenha = document.getElementById('loginSenha');
    if (loginSenha) loginSenha.addEventListener('keydown', e => { if (e.key === 'Enter') fazerLogin(); });
    const cadSenhaConf = document.getElementById('cadSenhaConf');
    if (cadSenhaConf) cadSenhaConf.addEventListener('keydown', e => { if (e.key === 'Enter') fazerCadastro(); });
});
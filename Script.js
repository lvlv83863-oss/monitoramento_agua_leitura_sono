/* Copo 3D (Three.js) — substitui a imagem estática img/copo.png.
   Geometria, materiais, bolhas e reflexos vêm de copo3d.html, sem alteração.
   Requer o three.min.js (r128) carregado antes deste arquivo. */
(function () {
  if (typeof THREE === 'undefined') return;
  const T = THREE;

  /* ---------- medidas (cm) — mesma ideia do motor: perfil analítico → grade → malha/partículas ---------- */
  const CM = { H: 12, Rt: 3.75, Rb: 2.6, wall: 0.3, floor: 0.8, water: 9.5 };
  const rOut = y => CM.Rb + (CM.Rt - CM.Rb) * y / CM.H;
  const rIn = y => rOut(y) - CM.wall;
  const wr = y => rIn(y) - 0.015;
  const P = (r, y) => new T.Vector2(r, y);

  function glassProfile() {
    const a = [P(0, 0), P(1.4, 0), P(CM.Rb - 0.3, 0), P(CM.Rb - 0.12, 0.04), P(CM.Rb - 0.04, 0.13)];
    for (let y = 0.75; y <= CM.H - 0.3; y += 0.75) a.push(P(rOut(y), y));
    const H = CM.H;
    a.push(P(rOut(H) + 0.05, H - 0.12), P(rOut(H) + 0.07, H), P(rOut(H) + 0.03, H + 0.05), P(rOut(H) - 0.15, H + 0.06), P(rIn(H) + 0.02, H + 0.04), P(rIn(H), H - 0.1));
    for (let y = H - 0.75; y >= 1.5; y -= 0.75) a.push(P(rIn(y), y));
    a.push(P(rIn(CM.floor) - 0.1, CM.floor), P(1.2, CM.floor), P(0, CM.floor + 0.04));
    return a;
  }
  function waterProfile() {
    const F = CM.floor, W = CM.water, a = [P(0, F + 0.05), P(1.2, F + 0.03), P(wr(F) - 0.1, F + 0.02)];
    for (let y = F + 0.7; y < W; y += 0.7) a.push(P(wr(y), y));
    a.push(P(wr(W), W), P(wr(W) * 0.5, W), P(0, W));
    return a;
  }
  const rng = (s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; })(7);

  /* ---------- enquadramento: reproduz a posição/escala do copo da imagem original ----------
     A imagem original (702 × 666 px) tem o copo ocupando, em frações da caixa, este retângulo: */
  const BOX = { w: 702, h: 666 };
  const IMG = { x0: 0.235, x1: 0.815, y0: 0.035, y1: 0.908 };
  const TILT = 13 * Math.PI / 180;   // inclinação do copo na imagem original (0 = copo reto)
  const START = { az: 0, el: 0.35 }; // ângulo inicial de visão
  const FOV = 14;                    // campo de visão baixo = pouca distorção de perspectiva, como na imagem
  const SPIN_PERIOD = 14;            // segundos para uma volta completa (360°) em torno do eixo Y
  const STRIPES_SPIN = false;        // false = reflexos fixos na câmera (luz parada); true = giram junto com o copo

  /*SLOSH-BEGIN*/
  /* ---------- motor de oscilação da água (modos normais da superfície livre) ----------
     A superfície é a soma de modos de um recipiente circular: h(r,θ,t) = Σ q_n(t)·J_m(k r/R)/J_m(k)·{cos mθ | sin mθ}.
     Cada modo é um oscilador amortecido (frequência da relação de dispersão da água, levemente desacelerada para ficar
     agradável à vista), excitado por: aceleração angular do copo, cisalhamento do líquido que ainda não acompanhou a
     rotação (inércia) e um forçamento mínimo contínuo. As amplitudes são em cm. */
  const MODES = [[1, 1.841, 1], [2, 3.054, 0.6], [3, 4.201, 0.4], [0, 3.832, 0.35], [4, 5.318, 0.22], [1, 5.331, 0.3]];   // [m, zero de J'm, participação]
  const SLOW = 0.3;       // fator de câmera lenta das frequências
  const TAU_W = 0.08;     // s: filtro da velocidade angular medida (para derivar a aceleração sem ruído)
  const TAU_S = 1.8;      // s: tempo para o líquido alcançar a rotação do copo (inércia)
  const ADV = 0.3;        // fração da rotação do líquido que arrasta o padrão de ondas
  const Q_MAX = 0.1;      // cm: limite rígido por modo (nunca passa disso)

  function besselJ(m, x) {   // série de potências, suficiente para x ≤ 6
    const h = x / 2; let t = 1; for (let i = 1; i <= m; i++) t *= h / i;
    let s = t; for (let k = 0; k < 14; k++) { t *= -h * h / ((k + 1) * (k + 1 + m)); s += t; }
    return s;
  }
  const hash = (a, b) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };

  function createSlosh(R, depth) {
    const B = [];   // um item por função-base (cos e sin para m>0)
    MODES.forEach(([m, zk, g], mi) => {
      const k = zk / R, w = SLOW * Math.sqrt(980 * k * Math.tanh(k * depth)), z = 0.04 * Math.pow(w / (SLOW * Math.sqrt(980 * 1.841 / R)), 1.2);
      for (let ty = 0; ty < (m ? 2 : 1); ty++) B.push({ m, zk, g, ty, w, z, q: 0, v: 0, fa: w * (0.75 + 0.5 * hash(mi, ty + 1)), fb: w * (0.6 + 0.8 * hash(mi + 9, ty + 3)), pa: 6.28 * hash(mi, ty + 5), pb: 6.28 * hash(mi + 4, ty + 7), norm: besselJ(m, zk) });
    });
    const S = { B, wf: 0, Of: 0, s: 0, alpha: 0 };
    S.syncOmega = om => { S.wf = om; S.Of = om; };
    S.step = (dt, omega, spin, t) => {
      if (dt <= 0) return;
      const wPrev = S.wf; S.wf += (omega - S.wf) * (1 - Math.exp(-dt / TAU_W));
      S.alpha = Math.max(-14, Math.min(14, (S.wf - wPrev) / dt));            // aceleração angular do copo
      S.Of += (S.wf - S.Of) * (1 - Math.exp(-dt / TAU_S)); S.s = S.wf - S.Of;  // líquido atrasado → rotação relativa
      const aw = Math.abs(S.wf), thf = spin + 0.9;
      const drive = 0.0009 + 0.022 * Math.min(aw, 1) + 0.006 * Math.min(Math.abs(S.s), 1) + 0.0015 * Math.min(Math.abs(S.alpha), 14);   // forçamento contínuo (residual + rotação + cisalhamento + aceleração)
      const nsub = Math.max(1, Math.ceil(dt / 0.008)), h = dt / nsub;
      for (let n = 0; n < B.length; n++) {
        const b = B[n], noise = 0.6 * Math.sin(b.fa * t + b.pa) + 0.4 * Math.sin(b.fb * t + b.pb);
        const dir = b.m ? (b.ty ? Math.sin(b.m * thf) : Math.cos(b.m * thf)) : 0;
        let F = b.g * (1.1 * Math.tanh(S.alpha / 5) * 5 * dir + drive * noise * 6);                // impulso direcional + agitação
        const sat = 1 / (1 + Math.pow(Math.abs(b.q) / 0.06, 2)); F *= sat;       // satura (sem ondas exageradas)
        b.F = F;
      }
      for (let i = 0; i < nsub; i++) for (let n = 0; n < B.length; n++) {
        const b = B[n];
        b.v += (b.F - 2 * b.z * b.w * b.v - b.w * b.w * b.q) * h; b.q += b.v * h;
        if (b.q > Q_MAX) { b.q = Q_MAX; if (b.v > 0) b.v = 0; } else if (b.q < -Q_MAX) { b.q = -Q_MAX; if (b.v < 0) b.v = 0; }
      }
      // o líquido em rotação arrasta o padrão de ondas (movimento relativo próprio)
      const dl = ADV * S.Of * dt;
      for (let n = 0; n < B.length; n++) { const b = B[n]; if (b.m && b.ty === 0) {
        const c = B[n], s = B[n + 1], cs = Math.cos(b.m * dl), sn = Math.sin(b.m * dl);
        let t1 = c.q * cs - s.q * sn; s.q = s.q * cs + c.q * sn; c.q = t1;
        t1 = c.v * cs - s.v * sn; s.v = s.v * cs + c.v * sn; c.v = t1; } }
    };
    return S;
  }
  /*SLOSH-END*/

  function init(root) {
    if (root.copo3d) return;   // evita duplicar renderizador/animação
    const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    root.appendChild(renderer.domElement);
    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(FOV, BOX.w / BOX.h, 0.1, 600);
    const target = new T.Vector3(0, 6.2, 0);

    scene.add(new T.AmbientLight(0xffffff, 0.75));
    const l1 = new T.DirectionalLight(0xffffff, 0.9); l1.position.set(3, 8, 6); scene.add(l1);
    const l2 = new T.DirectionalLight(0x9fd0ff, 0.5); l2.position.set(-6, 3, -4); scene.add(l2);

    const solid = new T.Group(); scene.add(solid);
    const glass = new T.Mesh(new T.LatheGeometry(glassProfile(), 72),
      new T.MeshPhongMaterial({ color: 0xcfe9f6, specular: 0xffffff, shininess: 140, transparent: true, opacity: 0.26, side: T.DoubleSide, depthWrite: false }));
    glass.renderOrder = 3; solid.add(glass);

    const water = new T.Mesh(new T.LatheGeometry(waterProfile(), 72),
      new T.MeshPhongMaterial({ color: 0x7ab9de, specular: 0xffffff, shininess: 60, transparent: true, opacity: 0.55, side: T.DoubleSide, depthWrite: false }));
    water.renderOrder = 2; solid.add(water);

    const surf = new T.Mesh(new T.CircleGeometry(wr(CM.water), 72), new T.MeshBasicMaterial({ color: 0xd6edf9, transparent: true, opacity: 0.45, side: T.DoubleSide, depthWrite: false }));
    surf.rotation.x = -Math.PI / 2; surf.position.y = CM.water + 0.005; surf.renderOrder = 2; solid.add(surf);
    const menis = new T.Mesh(new T.TorusGeometry(wr(CM.water), 0.035, 8, 72), new T.MeshBasicMaterial({ color: 0xeaf6fc, transparent: true, opacity: 0.7 }));
    menis.rotation.x = Math.PI / 2; menis.position.y = CM.water; solid.add(menis);

    // bolhas: coluna subindo do fundo + algumas na superfície
    const bGeo = new T.SphereGeometry(1, 14, 14), bMat = new T.MeshPhongMaterial({ color: 0x2f86c4, specular: 0xffffff, shininess: 120, transparent: true, opacity: 0.9 });
    const bub = (x, y, z, r) => { const m = new T.Mesh(bGeo, bMat); m.position.set(x, y, z); m.scale.setScalar(r); solid.add(m); };
    for (let i = 0; i < 22; i++) { const t = i / 21;
      bub(0.5 * Math.sin(t * 6.5 + 0.5) * (1 - 0.2 * t) + (rng() - 0.5) * 0.15, CM.floor + 0.35 + t * (CM.water - CM.floor - 0.9), 0.3 * Math.sin(t * 5) + (rng() - 0.5) * 0.15, 0.05 + rng() * 0.09 + t * 0.03); }
    for (let i = 0; i < 10; i++) { const a = rng() * 6.283, d = rng() * 2.5;
      bub(Math.cos(a) * d, CM.water - 0.1 - rng() * 0.5, Math.sin(a) * d, 0.03 + rng() * 0.025); }

    // reflexos verticais (ficam voltados para a câmera, como no desenho)
    const stripes = new T.Group(); solid.add(stripes);
    const sp = []; for (let y = 0.8; y <= 11.4; y += 0.8) sp.push(P(rOut(y) + 0.015, y));
    const sMat = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, side: T.DoubleSide, depthWrite: false });
    [[0.75, 0.2], [-0.62, 0.07]].forEach(([s, l]) => { const m = new T.Mesh(new T.LatheGeometry(sp, 6, s, l), sMat); m.renderOrder = 4; stripes.add(m); });

    /* ================= ANIMAÇÕES =================
       1) giro contínuo de 360° do copo em torno do eixo Y, da esquerda para a direita;
       2) ondas na superfície da água por deformação dos vértices (sem recriar geometria), reagindo à
          velocidade e à aceleração angular do copo com inércia e amortecimento (createSlosh). */

    // o que gira: vidro, água (laterais/fundo) e bolhas. Superfície e menisco são de revolução e ficam de fora
    // (suas ondas são calculadas no referencial do mundo, acompanhando o copo pelo anel de contato com a parede).
    const spinG = new T.Group(); solid.add(spinG);
    solid.children.slice().forEach(o => { if (o !== spinG && o !== stripes && o !== surf && o !== menis) spinG.add(o); });

    // superfície da água: mesma posição, raio e materiais, mas com malha polar densa para poder ondular
    const WL = CM.water, R = wr(WL), NR = 26, NS = 96, nv = (NR + 1) * (NS + 1);
    const sXZ = new Float32Array(nv * 2), sPos = new Float32Array(nv * 3), sNor = new Float32Array(nv * 3), sCol = new Float32Array(nv * 3).fill(1), sIdx = [];
    for (let i = 0; i <= NR; i++) for (let j = 0; j <= NS; j++) {
      const k = i * (NS + 1) + j, r = R * i / NR, a = j / NS * Math.PI * 2;
      sXZ[2 * k] = sPos[3 * k] = r * Math.sin(a); sXZ[2 * k + 1] = sPos[3 * k + 2] = r * Math.cos(a); sNor[3 * k + 1] = 1;
      if (i < NR && j < NS) { const c = k + NS + 1; sIdx.push(k, c, k + 1, k + 1, c, c + 1); }
    }
    const sGeo = new T.BufferGeometry();
    sGeo.setAttribute('position', new T.BufferAttribute(sPos, 3).setUsage(T.DynamicDrawUsage));
    sGeo.setAttribute('normal', new T.BufferAttribute(sNor, 3).setUsage(T.DynamicDrawUsage));
    sGeo.setAttribute('color', new T.BufferAttribute(sCol, 3).setUsage(T.DynamicDrawUsage));
    sGeo.setIndex(sIdx);
    const cap = new T.Mesh(sGeo, water.material); cap.position.y = WL; cap.renderOrder = 2; cap.frustumCulled = false; solid.add(cap);
    surf.geometry.dispose(); surf.geometry = sGeo; surf.rotation.x = 0; surf.frustumCulled = false;   // véu claro agora sobre a malha densa
    surf.material.vertexColors = true; surf.material.needsUpdate = true;                             // cor 1,1,1 em repouso = aparência idêntica

    // a tampa plana da água (3 anéis) é substituída pela malha densa; o anel de contato com a parede continua na lateral
    const wg = water.geometry, wn = wg.parameters.points.length, wp = wg.attributes.position.array, keep = [];
    for (let q = 0, ia = wg.index.array; q < ia.length; q += 3)
      if (!(wp[ia[q] * 3 + 1] > WL - 1e-6 && wp[ia[q + 1] * 3 + 1] > WL - 1e-6 && wp[ia[q + 2] * 3 + 1] > WL - 1e-6)) keep.push(ia[q], ia[q + 1], ia[q + 2]);
    wg.setIndex(keep); wg.attributes.position.setUsage(T.DynamicDrawUsage);

    // ondulação dinâmica: modos normais (ver createSlosh) avaliados por vértice com bases pré-calculadas (sem recriar malha)
    const SL = createSlosh(R, WL - CM.floor), NB = SL.B.length, DE = 0.01;
    const basisAt = (b, x, z) => { const r = Math.sqrt(x * x + z * z), th = Math.atan2(x, z), A = besselJ(b.m, b.zk * Math.min(r, R) / R) / b.norm;
      return A * (b.m === 0 ? 1 : b.ty ? Math.sin(b.m * th) : Math.cos(b.m * th)); };
    const bB = new Float32Array(nv * NB), bX = new Float32Array(nv * NB), bZ = new Float32Array(nv * NB);
    for (let k = 0; k < nv; k++) { const x = sXZ[2 * k], z = sXZ[2 * k + 1];
      for (let n = 0; n < NB; n++) { const b = SL.B[n], o = k * NB + n;
        bB[o] = basisAt(b, x, z); bX[o] = (basisAt(b, x + DE, z) - basisAt(b, x - DE, z)) / (2 * DE); bZ[o] = (basisAt(b, x, z + DE) - basisAt(b, x, z - DE)) / (2 * DE); } }
    const edgeH = th => { let h = 0; for (let n = 0; n < NB; n++) { const b = SL.B[n]; h += b.q * (b.m === 0 ? 1 : b.ty ? Math.sin(b.m * th) : Math.cos(b.m * th)); } return h; };   // altura na parede (r = R)

    // menisco: mesmo toro, agora deformado vértice a vértice para acompanhar a borda da água
    menis.geometry.rotateX(Math.PI / 2); menis.rotation.set(0, 0, 0); menis.frustumCulled = false;
    const mp = menis.geometry.attributes.position, mn = mp.count, mY0 = new Float32Array(mn), mTh = new Float32Array(mn);
    for (let k = 0; k < mn; k++) { mY0[k] = mp.getY(k); mTh[k] = Math.atan2(mp.getX(k), mp.getZ(k)); }
    mp.setUsage(T.DynamicDrawUsage);
    // anel de contato da água com a parede (gira com o copo)
    const ringIdx = []; for (let i = 0; i <= 72; i++) ringIdx.push((i * wn + wn - 3) * 3);

    const LD = l1.position.clone().normalize();
    const waves = (t, spin) => {
      for (let k = 0; k < nv; k++) {
        let h = 0, hx = 0, hz = 0; const o = k * NB;
        for (let n = 0; n < NB; n++) { const q = SL.B[n].q; h += q * bB[o + n]; hx += q * bX[o + n]; hz += q * bZ[o + n]; }
        const nx = -hx * 1.5, nz = -hz * 1.5, il = 1 / Math.sqrt(nx * nx + 1 + nz * nz);
        sPos[3 * k + 1] = h; sNor[3 * k] = nx * il; sNor[3 * k + 1] = il; sNor[3 * k + 2] = nz * il;
        const c = 1 + 6 * (il * (nx * LD.x + LD.y + nz * LD.z) - LD.y); sCol[3 * k] = sCol[3 * k + 1] = sCol[3 * k + 2] = c < 0.6 ? 0.6 : c > 1 ? 1 : c;
      }
      sGeo.attributes.position.needsUpdate = sGeo.attributes.normal.needsUpdate = sGeo.attributes.color.needsUpdate = true;
      for (let i = 0; i <= 72; i++) wp[ringIdx[i] + 1] = WL + edgeH(i / 72 * Math.PI * 2 + spin);   // vértice sobe/desce na própria parede
      wg.attributes.position.needsUpdate = true;
      for (let k = 0; k < mn; k++) mp.setY(k, mY0[k] + edgeH(mTh[k]));
      mp.needsUpdate = true;
    };

    /* ---------- câmera orbital (sem zoom, para manter sempre o mesmo tamanho) ---------- */
    let az = START.az, el = START.el, dist = 40, shift = { x: 0, y: 0 }, w = BOX.w, h = BOX.h;
    const place = () => {
      camera.position.set(target.x + dist * Math.sin(az) * Math.cos(el), target.y + dist * Math.sin(el), target.z + dist * Math.cos(az) * Math.cos(el));
      camera.lookAt(target); camera.rotateZ(-TILT); camera.updateMatrixWorld(true);
    };
    const outline = [];   // contorno do copo: círculos da boca e da base
    for (let i = 0; i < 64; i++) { const a = i / 64 * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), rt = CM.Rt + 0.07;
      outline.push(new T.Vector3(rt * c, CM.H, rt * s), new T.Vector3(CM.Rb * c, 0, CM.Rb * s)); }
    const bounds = () => { let x0 = 9, x1 = -9, y0 = 9, y1 = -9; const v = new T.Vector3();
      outline.forEach(p => { v.copy(p).project(camera); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); });
      return { x0, x1, y0, y1 }; };
    // distância e deslocamento de tela que fazem o copo cair no mesmo retângulo da imagem original
    const wantH = (IMG.y1 - IMG.y0) * 2, wantCx = (IMG.x0 + IMG.x1) - 1, wantCy = 1 - (IMG.y0 + IMG.y1);
    camera.clearViewOffset();
    for (let i = 0; i < 14; i++) {
      place(); camera.updateProjectionMatrix(); const b = bounds();
      dist *= (b.y1 - b.y0) / wantH;
      place(); camera.updateProjectionMatrix(); const c = bounds();
      shift.x += ((c.x0 + c.x1) / 2 - wantCx) / 2; shift.y += ((c.y0 + c.y1) / 2 - wantCy) / 2;
      camera.setViewOffset(BOX.w, BOX.h, shift.x * BOX.w, -shift.y * BOX.h, BOX.w, BOX.h); // desloca a janela de projeção (em fração da caixa)
    }
    const applyShift = () => camera.setViewOffset(w, h, shift.x * w, -shift.y * h, w, h);

    const resize = () => { w = root.clientWidth; h = root.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; applyShift(); camera.updateProjectionMatrix(); };
    const ro = new ResizeObserver(resize); ro.observe(root); resize();

    /* ---------- girar com o mouse/dedo (a rolagem da página continua funcionando) ---------- */
    let drag = null;
    root.addEventListener('pointerdown', e => { drag = e; root.setPointerCapture(e.pointerId); });
    root.addEventListener('pointermove', e => {
      if (!drag) return;
      az -= (e.clientX - drag.clientX) * 0.008;
      if (e.pointerType === 'mouse') el = Math.max(-0.2, Math.min(1.35, el + (e.clientY - drag.clientY) * 0.006));
      drag = e;
    });
    const end = () => { drag = null; };
    root.addEventListener('pointerup', end); root.addEventListener('pointercancel', end);

    let spin = 0, tAnim = 0, last = 0, raf = 0, prevAz = az, firstRun = true;
    const SPIN_W = 2 * Math.PI / SPIN_PERIOD;
    const frame = now => {
      raf = requestAnimationFrame(frame);
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 0; last = now;   // limita saltos após troca de aba
      tAnim += dt; spin = (spin + dt * SPIN_W) % (2 * Math.PI);
      spinG.rotation.y = spin;                       // esquerda → direita (a frente do copo se move para +x)
      // velocidade angular aparente do copo: giro automático + arrasto do usuário (o azimute da câmera gira ao contrário)
      const azVel = dt > 0 ? (az - prevAz) / dt : 0; prevAz = az;
      const omega = Math.max(-8, Math.min(8, SPIN_W - azVel));
      if (dt === 0) { if (!firstRun) SL.syncOmega(omega); }                    // volta à tela: sem tranco; no 1º quadro a água parte do repouso
      else { firstRun = false; SL.step(dt, omega, spin, tAnim); }
      waves(tAnim, spin);
      place(); stripes.rotation.y = STRIPES_SPIN ? spin : az;
      renderer.render(scene, camera);
    };
    const start = () => { if (!raf) { last = 0; raf = requestAnimationFrame(frame); } };
    const stop = () => { cancelAnimationFrame(raf); raf = 0; };
    const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es[es.length - 1].isIntersecting ? start() : stop()) : null;
    io ? io.observe(root) : start();                 // só anima enquanto o copo está visível na tela

    root.copo3d = { destroy() {
      stop(); if (io) io.disconnect(); ro.disconnect(); drag = null;
      scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      renderer.dispose(); root.removeChild(renderer.domElement); delete root.copo3d;
    } };
  }

  document.querySelectorAll('[data-copo3d]').forEach(init);
})();
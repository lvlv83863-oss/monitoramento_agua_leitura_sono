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
      for (let ty = 0; ty < (m ? 2 : 1); ty++) B.push({ m, zk, g, ty, w: w * (1 + 0.013 * ty), z: z * (1 + 0.07 * ty), q: 0, v: 0, F: 0, pha: 6.28 * hash(mi + 2, ty + 11), phb: 6.28 * hash(mi + 6, ty + 13), lfo: 6.28 * hash(mi + 8, ty + 17), lfr: 0.25 + 0.35 * hash(mi + 3, ty + 19), fa: w * (0.75 + 0.5 * hash(mi, ty + 1)), fb: w * (0.6 + 0.8 * hash(mi + 9, ty + 3)), pa: 6.28 * hash(mi, ty + 5), pb: 6.28 * hash(mi + 4, ty + 7), norm: besselJ(m, zk) });
    });
    const S = { B, wf: 0, Of: 0, s: 0, alpha: 0 };
    S.syncOmega = om => { S.wf = om; S.Of = om; };
    S.step = (dt, omega, spin, t) => {
      if (dt <= 0) return;
      const wPrev = S.wf; S.wf += (omega - S.wf) * (1 - Math.exp(-dt / TAU_W));
      S.alpha = Math.max(-14, Math.min(14, (S.wf - wPrev) / dt));            // aceleração angular do copo
      S.Of += (S.wf - S.Of) * (1 - Math.exp(-dt / TAU_S)); S.s = S.wf - S.Of;  // líquido atrasado → rotação relativa
      const aw = Math.abs(S.wf), thf = spin + 0.9, ths = thf + 1.2, aa = Math.min(Math.abs(S.alpha), 14), w1 = B[0].w;
      const drive = 0.0009 + 0.05 * Math.min(aw, 1) + 0.006 * Math.min(Math.abs(S.s), 1) + 0.0015 * aa;   // forçamento contínuo (residual + rotação + cisalhamento + aceleração)
      const nsub = Math.max(1, Math.ceil(dt / 0.008)), h = dt / nsub;
      for (let n = 0; n < B.length; n++) {
        const b = B[n];
        // fases da agitação com deriva lenta de frequência e amplitude modulada: evita padrão repetitivo/simétrico
        b.pha += b.fa * (1 + 0.10 * Math.sin(0.11 * t + b.pb)) * dt; b.phb += b.fb * (1 + 0.08 * Math.sin(0.07 * t + b.pa)) * dt; b.lfo += b.lfr * dt;
        const noise = 0.6 * Math.sin(b.pha) + 0.4 * Math.sin(b.phb), mod = 1 + 0.35 * Math.sin(b.lfo);
        const dir  = b.m ? (b.ty ? Math.sin(b.m * thf) : Math.cos(b.m * thf)) : 0;   // impulso da aceleração (ponto da parede que "empurra")
        const dirS = b.m ? (b.ty ? Math.sin(b.m * ths) : Math.cos(b.m * ths)) : 0;   // arrasto do líquido que ficou para trás (defasado → ondas viajantes)
        const gA = b.g * (1 + 0.05 * aa * (b.w / w1 - 1));                            // aceleração brusca excita mais os modos agudos
        let F = gA * (1.1 * Math.tanh(S.alpha / 5) * 5 * dir + 1.5 * Math.tanh(S.s) * dirS + drive * mod * noise * 6);
        const sat = 1 / (1 + Math.pow(Math.abs(b.q) / 0.06, 2)); F *= sat;           // satura (sem ondas exageradas)
        b.F = F;
      }
      for (let i = 0; i < nsub; i++) for (let n = 0; n < B.length; n++) {
        const b = B[n];
        b.v += (b.F - 2 * b.z * b.w * b.v - b.w * b.w * b.q) * h; b.q += b.v * h;
        if (b.q > Q_MAX) { b.q = Q_MAX; if (b.v > 0) b.v = 0; } else if (b.q < -Q_MAX) { b.q = -Q_MAX; if (b.v < 0) b.v = 0; }
      }
      for (let n = 0; n < B.length; n++) if (!isFinite(B[n].q) || !isFinite(B[n].v)) B[n].q = B[n].v = 0;   // proteção contra instabilidade
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
    const bubs = [];   // posição-base (referencial do copo) de cada bolha; o movimento é só uma perturbação em torno dela
    const bub = (x, y, z, r) => { const m = new T.Mesh(bGeo, bMat); m.position.set(x, y, z); m.scale.setScalar(r); solid.add(m); bubs.push({ m, x, y, z, r, ph: 6.28 * hash(bubs.length, 3) }); };
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

    // bolhas acompanham o líquido: órbita horizontal das ondas (some com a profundidade), deriva por inércia do líquido,
    // leve oscilação vertical e nunca acima da superfície nem através da parede. As posições-base não mudam.
    const hAt = (x, z) => { let h = 0; for (let n = 0; n < NB; n++) h += SL.B[n].q * basisAt(SL.B[n], x, z); return h; };
    let bDrift = 0;
    const moveBubbles = (t, spin, dt) => {
      bDrift += (-0.35 * SL.s - 0.9 * bDrift) * dt;        // líquido atrasado → bolhas ficam um pouco para trás; volta ao repouso
      const cs = Math.cos(spin), sn = Math.sin(spin), cb = Math.cos(bDrift), sb = Math.sin(bDrift), act = Math.min(1, Math.abs(SL.alpha) / 6 + Math.abs(SL.s) / 1.5), e = 0.05;
      for (let i = 0; i < bubs.length; i++) { const b = bubs[i];
        let x = b.x * cb + b.z * sb, z = -b.x * sb + b.z * cb;
        const wgt = Math.exp(-Math.max(0, WL - b.y) / 1.3);
        const wx = x * cs + z * sn, wz = -x * sn + z * cs;            // posição no mundo (onde a onda é calculada)
        const h0 = hAt(wx, wz), hx = (hAt(wx + e, wz) - hAt(wx - e, wz)) / (2 * e), hz = (hAt(wx, wz + e) - hAt(wx, wz - e)) / (2 * e);
        const dxw = -hx * 1.2 * wgt, dzw = -hz * 1.2 * wgt;
        x += dxw * cs - dzw * sn; z += dxw * sn + dzw * cs;
        const rmax = wr(b.y) - b.r - 0.04, rr = Math.sqrt(x * x + z * z); if (rr > rmax) { x *= rmax / rr; z *= rmax / rr; }
        let y = b.y + h0 * wgt + (0.012 + 0.03 * act) * Math.sin(t * 1.4 + b.ph);
        y = Math.min(y, WL + h0 - b.r - 0.02);
        b.m.position.set(x, y, z);
      }
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

    let spin = 0, tAnim = 0, last = 0, raf = 0, prevAz = az, azVelF = 0, firstRun = true;
    const AUTO_SPIN = true;                           // false → copo em repouso (giro automático desligado)
    const SPIN_W = AUTO_SPIN ? 2 * Math.PI / SPIN_PERIOD : 0;
    const frame = now => {
      raf = requestAnimationFrame(frame);
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 0; last = now;   // limita saltos após troca de aba
      tAnim += dt; spin = (spin + dt * SPIN_W) % (2 * Math.PI);
      spinG.rotation.y = spin;                       // esquerda → direita (a frente do copo se move para +x)
      // velocidade angular aparente do copo: giro automático + arrasto do usuário (o azimute da câmera gira ao contrário)
      // (só o azimute — a elevação `el` apenas muda o ponto de vista e não entra na física)
      // azVel é suavizado (~0,04 s): eventos de ponteiro chegam em saltos e gerariam picos falsos de aceleração
      const azRaw = dt > 0 ? (az - prevAz) / dt : 0; prevAz = az;
      azVelF += (azRaw - azVelF) * (dt > 0 ? 1 - Math.exp(-dt / 0.04) : 0);
      const omega = Math.max(-8, Math.min(8, SPIN_W - azVelF));
      if (dt === 0) { if (!firstRun) SL.syncOmega(omega); }                    // volta à tela: sem tranco; no 1º quadro a água parte do repouso
      else { firstRun = false; SL.step(dt, omega, spin, tAnim); }
      moveBubbles(tAnim, spin, dt);
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


/* ============================================================================
   PAINEL DE MONITORAMENTO GERAL — calendário, atividades, gráficos, estatísticas e frases
   Apenas LÊ os registros de Água, Leitura e Sono (não cria dados nem sistema de armazenamento).
   Fonte: localStorage. Cada chave guarda uma lista (JSON) de registros; sem registros → estados vazios.

     habittracker.agua     [{ "data": "2026-11-10", "hora": "14:30", "ml": 250 }, ...]
     habittracker.leitura  [{ "data": "2026-11-10", "hora": "20:00", "minutos": 30, "paginas": 12, "livro": "..." }, ...]
     habittracker.sono     [{ "data": "2026-11-10", "dormiu": "23:00", "acordou": "06:20" }, ...]   (data = dia em que acordou)
     habittracker.metas    { "agua": 2000, "leitura": 30, "sono": 8 }        (opcional: ml/dia, min/dia, horas/noite)

   Nomes alternativos de campos são aceitos (ver FIELDS). Para apontar para outras chaves, edite STORE.
   O painel se atualiza sozinho quando: outra aba grava (evento "storage"), a página volta ao foco, ou o
   monitoramento dispara  document.dispatchEvent(new Event('habittracker:update'))  após gravar.
   ============================================================================ */
(function () {
  const root = document.getElementById('painel-geral');
  if (!root) return;

  const STORE = { agua: 'habittracker.agua', leitura: 'habittracker.leitura', sono: 'habittracker.sono', metas: 'habittracker.metas' };
  const DEFAULT_GOALS = { agua: 2000, leitura: 30, sono: 8 };   // usadas só se "habittracker.metas" não existir
  const FIELDS = {
    data: ['data', 'date', 'dia', 'timestamp'], hora: ['hora', 'horario', 'time'],
    ml: ['ml', 'quantidade', 'volume', 'valor'], litros: ['litros', 'l'],
    minutos: ['minutos', 'min', 'duracao', 'tempo'], paginas: ['paginas', 'pags'], livro: ['livro', 'titulo'],
    dormiu: ['dormiu', 'inicio', 'deitou'], acordou: ['acordou', 'fim', 'despertou'], horas: ['horas', 'duracaoHoras']
  };
  const HABITS = ['agua', 'leitura', 'sono'];
  const NAME = { agua: 'Água', leitura: 'Leitura', sono: 'Sono' };
  const QUOTES = {
    inicio: ['Todo grande hábito começa com um pequeno registro.', 'Hoje é um bom dia para dar o primeiro passo.', 'Começar pequeno ainda é começar.', 'O primeiro registro é o mais importante.'],
    meio: ['Constância vale mais que intensidade.', 'Disciplina é escolher o que você quer agora e o que mais quer depois.', 'Pequenas ações diárias constroem grandes resultados.', 'Não precisa ser perfeito, precisa ser frequente.', 'Você não precisa de motivação, precisa de rotina.'],
    meta: ['Meta cumprida! É assim que os hábitos se firmam.', 'Dia completo: o seu eu de amanhã agradece.', 'Consistência é o que transforma esforço em estilo de vida.', 'Cada meta concluída é um voto no tipo de pessoa que você quer ser.']
  };

  const $ = id => document.getElementById(id);
  const el = { balanco: $('p-balanco'), balancoData: $('p-balanco-data'), lista: $('p-lista'), periodo: $('p-periodo'), cal: $('p-cal'), mesNome: $('p-mes-nome'),
    grafico: $('p-grafico'), stats: $('p-stats'), statsPeriodo: $('p-stats-periodo'), frase: $('p-frase') };

  /* ---------- datas ---------- */
  const pad = n => String(n).padStart(2, '0');
  const keyOf = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parseKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (k, n) => { const d = parseKey(k); d.setDate(d.getDate() + n); return keyOf(d); };
  const todayKey = () => keyOf(new Date());
  const toKey = v => {
    if (v == null || v === '') return null;
    if (typeof v === 'string') { let m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/); if (m) return v; m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); if (m) return m[3] + '-' + m[2] + '-' + m[1]; }
    const d = new Date(v); return isNaN(d) ? null : keyOf(d);
  };
  const toTime = v => {
    if (v == null || v === '') return '';
    if (typeof v === 'string') { const m = v.match(/^(\d{1,2}):(\d{2})/); if (m) return pad(+m[1]) + ':' + m[2]; if (!/T/.test(v)) return ''; }
    const d = new Date(v); return isNaN(d) ? '' : pad(d.getHours()) + ':' + pad(d.getMinutes());
  };
  const mins = t => { const m = /^(\d{2}):(\d{2})$/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : null; };
  const fmtShort = k => new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' }).format(parseKey(k)).replace(/\./g, '');
  const fmtDay = k => k === todayKey() ? 'Hoje' : k === addDays(todayKey(), -1) ? 'Ontem' : fmtShort(k).replace(/^./, c => c.toUpperCase());
  const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const num = n => Math.round(n).toLocaleString('pt-BR');
  const hm = h => { const t = Math.round(h * 60); return Math.floor(t / 60) + 'h ' + pad(t % 60) + 'm'; };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pick = (r, names) => { for (const n of names) if (r[n] != null && r[n] !== '') return r[n]; return null; };

  /* ---------- leitura dos registros existentes ---------- */
  const readJSON = key => { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } };
  const asList = raw => {   // aceita lista, ou objeto {data: [registros] | total}
    if (Array.isArray(raw)) return raw.filter(r => r && typeof r === 'object');
    if (raw && typeof raw === 'object') return Object.entries(raw).flatMap(([k, v]) => Array.isArray(v) ? v.map(r => Object.assign({ data: k }, r)) : (typeof v === 'number' ? [{ data: k, ml: v, minutos: v, horas: v }] : []));
    return [];
  };
  let goals = Object.assign({}, DEFAULT_GOALS), days = {};

  function load() {
    const g = readJSON(STORE.metas) || {};
    goals = { agua: +g.agua > 0 ? +g.agua : DEFAULT_GOALS.agua, leitura: +g.leitura > 0 ? +g.leitura : DEFAULT_GOALS.leitura, sono: +g.sono > 0 ? +g.sono : DEFAULT_GOALS.sono };
    days = {};
    const day = k => days[k] || (days[k] = { agua: null, leitura: null, sono: null });
    asList(readJSON(STORE.agua)).forEach(r => {
      const k = toKey(pick(r, FIELDS.data)); let ml = +pick(r, FIELDS.ml); if (!(ml > 0)) { const l = +pick(r, FIELDS.litros); ml = l > 0 ? l * 1000 : 0; }
      if (!k || !(ml > 0)) return; const d = day(k); const h = d.agua || (d.agua = { total: 0, recs: [] });
      h.total += ml; h.recs.push({ time: toTime(pick(r, FIELDS.hora) ?? pick(r, FIELDS.data)), ml });
    });
    asList(readJSON(STORE.leitura)).forEach(r => {
      const k = toKey(pick(r, FIELDS.data)), m = +pick(r, FIELDS.minutos) || 0, p = +pick(r, FIELDS.paginas) || 0;
      if (!k || !(m > 0 || p > 0)) return; const d = day(k); const h = d.leitura || (d.leitura = { min: 0, pages: 0, recs: [] });
      h.min += m; h.pages += p; h.recs.push({ time: toTime(pick(r, FIELDS.hora) ?? pick(r, FIELDS.data)), min: m, pages: p, livro: pick(r, FIELDS.livro) });
    });
    asList(readJSON(STORE.sono)).forEach(r => {
      const k = toKey(pick(r, FIELDS.data)); if (!k) return;
      const s = toTime(pick(r, FIELDS.dormiu)), w = toTime(pick(r, FIELDS.acordou));
      let m = (+pick(r, FIELDS.horas) || 0) * 60; if (!m && s && w) m = (mins(w) - mins(s) + 1440) % 1440;
      if (!(m > 0)) return; const d = day(k); const h = d.sono || (d.sono = { min: 0, recs: [] });
      h.min += m; h.recs.push({ from: s, to: w, min: m });
    });
    Object.values(days).forEach(d => { if (d.agua) d.agua.recs.sort((a, b) => a.time.localeCompare(b.time)); if (d.leitura) d.leitura.recs.sort((a, b) => a.time.localeCompare(b.time)); });
  }

  /* ---------- cálculos ---------- */
  const value = (h, k) => { const d = days[k] && days[k][h]; if (!d) return null; return h === 'agua' ? d.total : h === 'leitura' ? (d.min > 0 ? d.min : null) : d.min / 60; };
  const pct = (h, k) => { const v = value(h, k); return v == null ? null : v / goals[h] * 100; };
  const hasAny = k => !!days[k];
  const winLen = () => state.period === 'mes' ? 30 : 7;
  const windowKeys = (end, n) => Array.from({ length: n }, (_, i) => addDays(end, i - n + 1));
  const avgPct = keys => { const v = keys.flatMap(k => HABITS.map(h => pct(h, k))).filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const streak = end => { let k = end; if (!hasAny(k) && k === todayKey()) k = addDays(k, -1); let n = 0; while (hasAny(k)) { n++; k = addDays(k, -1); } return n; };
  const trend = (h, k) => { const a = value(h, k), b = value(h, addDays(k, -1)); return a != null && b ? Math.round((a - b) / b * 100) : null; };
  const sign = n => (n > 0 ? '+' : '') + n;

  /* ---------- estado ---------- */
  const state = { sel: todayKey(), view: { y: new Date().getFullYear(), m: new Date().getMonth() }, period: 'semana', quote: 0 };

  /* ---------- balanço do dia (anéis) ---------- */
  const COLORS = { agua: 'var(--p-agua)', leitura: 'var(--p-leitura)', sono: 'var(--p-sono)' };
  function renderBalanco() {
    const k = state.sel, R = { agua: 86, leitura: 66, sono: 46 }, any = hasAny(k);
    el.balancoData.textContent = fmtDay(k);
    const ring = h => { const r = R[h], c = 2 * Math.PI * r, p = Math.min(100, Math.max(0, pct(h, k) || 0));
      return '<circle cx="100" cy="100" r="' + r + '" class="p-trilha"/><circle cx="100" cy="100" r="' + r + '" class="p-arco" stroke="' + COLORS[h] + '" stroke-dasharray="' + (c * p / 100).toFixed(1) + ' ' + c.toFixed(1) + '" transform="rotate(-90 100 100)"/>'; };
    const avg = avgPct([k]);
    const pill = h => { const p = pct(h, k); return '<span class="p-pilula p-pilula_' + h + '"><i style="background:' + COLORS[h] + '"></i>' + NAME[h] + (p == null ? '' : ' – ' + Math.round(p) + '%') + '</span>'; };
    el.balanco.innerHTML = '<svg viewBox="0 0 200 200" role="img" aria-label="Progresso das metas no dia">' + HABITS.map(ring).join('') +
      '<text x="100" y="' + (any ? 106 : 104) + '" text-anchor="middle" class="p-anel_num">' + (avg == null ? '—' : Math.round(avg) + '%') + '</text></svg>' + HABITS.map(pill).join('') +
      (any ? '' : '<p class="p-vazio p-anel_vazio">Sem registros nesta data.</p>');
  }

  /* ---------- lista de atividades ---------- */
  function renderLista() {
    const keys = state.period === 'dia' ? [state.sel] : windowKeys(state.sel, winLen()).reverse();
    const used = keys.filter(hasAny);
    if (!used.length) { el.lista.innerHTML = '<p class="p-vazio">' + (state.period === 'dia' ? 'Nenhum registro nesta data.' : 'Nenhum registro neste período.') + '<br><small>Os registros de Água, Leitura e Sono aparecerão aqui.</small></p>'; return; }
    el.lista.innerHTML = used.map(k => {
      const d = days[k], done = HABITS.filter(h => pct(h, k) >= 100), total = HABITS.filter(h => d[h]);
      const row = (h, label, detail, time) => '<li class="p-item"><span class="p-check' + (pct(h, k) >= 100 ? ' ok' : '') + '" title="' + (pct(h, k) >= 100 ? 'Meta do dia atingida' : 'Meta do dia não atingida') + '"></span><span class="p-dot" style="background:' + COLORS[h] + '"></span><span class="p-item_txt"><b>' + label + '</b> ' + detail + '</span><span class="p-item_hora">' + time + '</span></li>';
      const items = [];
      if (d.agua) d.agua.recs.forEach(r => items.push([r.time, row('agua', 'Água', num(r.ml) + ' ml', r.time)]));
      if (d.leitura) d.leitura.recs.forEach(r => items.push([r.time, row('leitura', 'Leitura', [r.min ? r.min + ' min' : '', r.pages ? r.pages + ' pág.' : '', r.livro ? esc(r.livro) : ''].filter(Boolean).join(' · '), r.time)]));
      if (d.sono) d.sono.recs.forEach(r => items.push([r.to || r.from, row('sono', 'Sono', (r.from && r.to ? r.from + ' → ' + r.to + ' · ' : '') + hm(r.min / 60), r.to || '')]));
      items.sort((a, b) => (a[0] || '').localeCompare(b[0] || ''));
      return '<section class="p-grupo' + (k === state.sel ? ' sel' : '') + '"><button type="button" class="p-grupo_cab" data-k="' + k + '"><span>' + fmtDay(k) + '</span><span class="p-grupo_meta">' + done.length + '/' + total.length + ' metas</span></button><ul>' + items.map(i => i[1]).join('') + '</ul></section>';
    }).join('');
  }

  /* ---------- calendário ---------- */
  function renderCal() {
    const { y, m } = state.view, first = new Date(y, m, 1).getDay(), n = new Date(y, m + 1, 0).getDate(), t = todayKey();
    el.mesNome.textContent = MONTHS[m] + ' ' + y;
    let h = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map(x => '<span class="p-cal_sem">' + x + '</span>').join('') + '<span></span>'.repeat(first);
    for (let d = 1; d <= n; d++) {
      const k = y + '-' + pad(m + 1) + '-' + pad(d), reg = HABITS.filter(x => days[k] && days[k][x]).map(x => NAME[x]);
      h += '<button type="button" class="p-dia' + (reg.length ? ' tem' : '') + (k === t ? ' hoje' : '') + (k === state.sel ? ' sel' : '') + '" data-k="' + k + '" aria-pressed="' + (k === state.sel) + '" aria-label="' + d + ' de ' + MONTHS[m] + (reg.length ? ', registros: ' + reg.join(', ') : ', sem registros') + '" title="' + (reg.length ? reg.join(', ') : 'Sem registros') + '">' + d + '</button>';
    }
    el.cal.innerHTML = h;
  }

  /* ---------- gráfico (SVG com os dados reais; % da meta diária de cada hábito) ---------- */
  function renderGrafico() {
    const n = winLen(), keys = windowKeys(state.sel, n), W = Math.max(260, el.grafico.clientWidth || 560), H = 262, L = 38, Rr = 10, Tp = 12, B = 30;
    const any = keys.some(hasAny);
    if (!any) { el.grafico.innerHTML = '<p class="p-vazio p-grafico_vazio">Sem registros nos últimos ' + n + ' dias.<br><small>O gráfico reúne Água, Leitura e Sono assim que houver registros.</small></p>'; return; }
    const all = keys.flatMap(k => HABITS.map(h => pct(h, k))).filter(v => v != null), top = Math.max(100, Math.min(150, Math.ceil(Math.max(...all) / 25) * 25));
    const X = i => L + (n === 1 ? 0 : i * (W - L - Rr) / (n - 1)), Y = v => Tp + (H - Tp - B) * (1 - Math.min(v, top) / top), colW = (W - L - Rr) / Math.max(1, n - 1);
    let g = '';
    for (let v = 0; v <= top; v += 25) g += '<line x1="' + L + '" x2="' + (W - Rr) + '" y1="' + Y(v) + '" y2="' + Y(v) + '" class="p-grade' + (v === 100 ? ' meta' : '') + '"/><text x="' + (L - 8) + '" y="' + (Y(v) + 4) + '" text-anchor="end" class="p-eixo">' + v + '%</text>';
    keys.forEach((k, i) => { if (n <= 7 || i % 5 === 0 || i === n - 1) g += '<text x="' + X(i) + '" y="' + (H - 8) + '" text-anchor="middle" class="p-eixo' + (k === state.sel ? ' sel' : '') + '">' + (n <= 7 ? new Intl.DateTimeFormat('pt-BR', { weekday: 'narrow' }).format(parseKey(k)).toUpperCase() + ' ' : '') + +k.slice(8) + '</text>'; });
    const si = keys.indexOf(state.sel);
    if (si >= 0) g += '<rect x="' + (X(si) - colW / 2) + '" y="' + Tp + '" width="' + colW + '" height="' + (H - Tp - B) + '" rx="8" class="p-faixa"/>';
    HABITS.forEach(h => {
      let d = '', up = false; keys.forEach((k, i) => { const p = pct(h, k); if (p == null) { up = false; return; } d += (up ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(p).toFixed(1); up = true; });
      g += '<path d="' + d + '" class="p-linha" stroke="' + COLORS[h] + '"/>';
      keys.forEach((k, i) => { const p = pct(h, k); if (p != null) g += '<circle cx="' + X(i).toFixed(1) + '" cy="' + Y(p).toFixed(1) + '" r="' + (k === state.sel ? 5 : 3.5) + '" class="p-ponto" fill="' + COLORS[h] + '"/>'; });
    });
    keys.forEach((k, i) => { g += '<rect x="' + (X(i) - colW / 2) + '" y="0" width="' + colW + '" height="' + H + '" class="p-hit" data-k="' + k + '" data-i="' + i + '"/>'; });
    el.grafico.innerHTML = '<svg width="' + W + '" height="' + H + '" role="img" aria-label="Evolução do percentual das metas de água, leitura e sono">' + g + '</svg><div class="p-dica" hidden></div>';
  }
  function tip(e) {
    const hit = e.target.closest && e.target.closest('.p-hit'), box = el.grafico.querySelector('.p-dica');
    if (!box) return; if (!hit) { box.hidden = true; return; }
    const k = hit.dataset.k, f = { agua: v => num(v) + ' ml', leitura: v => num(v) + ' min', sono: v => hm(v) };
    box.innerHTML = '<b>' + fmtShort(k) + '</b>' + HABITS.map(h => { const v = value(h, k), p = pct(h, k); return '<span><i style="background:' + COLORS[h] + '"></i>' + NAME[h] + ': ' + (v == null ? 'sem registro' : f[h](v) + (p == null ? '' : ' (' + Math.round(p) + '%)')) + '</span>'; }).join('');
    const r = el.grafico.getBoundingClientRect(), x = e.clientX - r.left; box.hidden = false;
    box.style.left = Math.max(4, Math.min(r.width - box.offsetWidth - 4, x + 12)) + 'px';
  }

  /* ---------- estatísticas ---------- */
  function renderStats() {
    const n = winLen(), keys = windowKeys(state.sel, n);
    el.statsPeriodo.textContent = 'Últimos ' + n + ' dias';
    const cells = keys.flatMap(k => HABITS.map(h => ({ h, p: pct(h, k) }))).filter(c => c.p != null), met = cells.filter(c => c.p >= 100).length;
    const active = keys.filter(hasAny).length, prev = avgPct(windowKeys(addDays(state.sel, -n), n)), cur = avgPct(keys);
    const evo = cur != null && prev != null ? Math.round(cur - prev) : null;
    if (!cells.length && !active) { el.stats.innerHTML = '<p class="p-vazio">Sem registros neste período.<br><small>Os indicadores aparecem após os primeiros registros.</small></p>'; return; }
    const tile = (v, l, s) => '<div class="p-tile"><strong>' + v + '</strong><span>' + l + '</span>' + (s ? '<small>' + s + '</small>' : '') + '</div>';
    const freq = h => { const c = keys.filter(k => days[k] && days[k][h]).length; return '<li><span>' + NAME[h] + '</span><div class="p-barra"><i style="width:' + (c / n * 100) + '%;background:' + COLORS[h] + '"></i></div><em>' + c + '/' + n + '</em></li>'; };
    el.stats.innerHTML = '<div class="p-tiles">' +
      tile(met + '/' + cells.length, 'Metas concluídas', cells.length ? Math.round(met / cells.length * 100) + '% das metas registradas' : '') +
      tile(Math.round(active / n * 100) + '%', 'Frequência', active + ' de ' + n + ' dias com registro') +
      tile(streak(state.sel) + (streak(state.sel) === 1 ? ' dia' : ' dias'), 'Sequência', 'dias seguidos com registro') +
      tile(evo == null ? '—' : sign(evo) + ' pts', 'Evolução', evo == null ? 'precisa de dois períodos com registros' : 'média das metas vs período anterior') +
      '</div><ul class="p-freq">' + HABITS.map(freq).join('') + '</ul>';
  }

  /* ---------- cartões dos hábitos ---------- */
  function renderHab() {
    const k = state.sel, bar = (h, p) => '<div class="p-barra grande"><i style="width:' + Math.min(100, p || 0) + '%;background:' + COLORS[h] + '"></i></div>';
    const tr = (h) => { const t = trend(h, k); return '<div><small>vs dia anterior</small><b>' + (t == null ? '—' : sign(t) + '%') + '</b></div>'; };
    const card = (h, big, sub, extra, p) => document.querySelector('#p-' + h + ' .p-hab_corpo').innerHTML = big === null ?
      '<p class="p-vazio">Sem registros em ' + fmtDay(k).toLowerCase() + '.</p>' :
      '<div class="p-hab_valor">' + big + '</div><div class="p-hab_sub">' + sub + '</div>' + bar(h, p) + '<div class="p-hab_rodape">' + extra + tr(h) + '</div>';
    const a = days[k] && days[k].agua, l = days[k] && days[k].leitura, s = days[k] && days[k].sono;
    card('agua', a ? num(a.total) + '<small> ml</small>' : null, 'meta: ' + num(goals.agua) + ' ml', a ? '<div><small>Registros</small><b>' + a.recs.length + '</b></div>' : '', pct('agua', k));
    card('leitura', l ? (l.min ? num(l.min) + '<small> min</small>' : num(l.pages) + '<small> pág.</small>') : null, 'meta: ' + num(goals.leitura) + ' min', l ? '<div><small>Páginas</small><b>' + (l.pages || '—') + '</b></div>' : '', pct('leitura', k));
    card('sono', s ? hm(s.min / 60) : null, 'meta: ' + hm(goals.sono) + ' · ' + (s ? (s.min / 60 >= goals.sono ? 'meta atingida' : 'abaixo da meta') : ''), s ? '<div><small>Horário</small><b>' + (s.recs[0].from && s.recs[0].to ? s.recs[0].from + ' – ' + s.recs[0].to : '—') + '</b></div>' : '', pct('sono', k));
  }

  /* ---------- frases motivacionais (mudam com o estado e a cada 15 s) ---------- */
  function renderFrase() {
    const k = state.sel, pool = !hasAny(k) ? QUOTES.inicio : (HABITS.some(h => pct(h, k) >= 100) ? QUOTES.meta : QUOTES.meio);
    el.frase.classList.add('troca');
    setTimeout(() => { el.frase.textContent = '“' + pool[(state.quote + +k.slice(8)) % pool.length] + '”'; el.frase.classList.remove('troca'); }, 160);
  }

  /* ---------- orquestração ---------- */
  function render(skipQuote) { renderBalanco(); renderLista(); renderCal(); renderGrafico(); renderStats(); renderHab(); if (!skipQuote) renderFrase(); }
  function select(k) { if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) return; state.sel = k; const d = parseKey(k); state.view = { y: d.getFullYear(), m: d.getMonth() }; state.quote++; render(); }
  const refresh = () => { load(); render(true); };

  root.addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (b) select(b.dataset.k); });
  $('p-mes-ant').addEventListener('click', () => { const v = state.view; state.view = v.m ? { y: v.y, m: v.m - 1 } : { y: v.y - 1, m: 11 }; renderCal(); });
  $('p-mes-prox').addEventListener('click', () => { const v = state.view; state.view = v.m < 11 ? { y: v.y, m: v.m + 1 } : { y: v.y + 1, m: 0 }; renderCal(); });
  el.periodo.addEventListener('change', () => { state.period = el.periodo.value; render(true); });
  el.grafico.addEventListener('pointermove', tip); el.grafico.addEventListener('pointerleave', () => { const b = el.grafico.querySelector('.p-dica'); if (b) b.hidden = true; });
  window.addEventListener('storage', e => { if (!e.key || e.key.indexOf('habittracker.') === 0) refresh(); });
  document.addEventListener('habittracker:update', refresh);
  window.addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  if ('ResizeObserver' in window) { let w = 0; new ResizeObserver(() => { if (el.grafico.clientWidth !== w) { w = el.grafico.clientWidth; renderGrafico(); } }).observe(el.grafico); }
  setInterval(() => { if (!document.hidden) { state.quote++; renderFrase(); } }, 15000);

  load(); render();
})();

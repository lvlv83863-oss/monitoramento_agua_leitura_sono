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
  const AUTO = false;                // true = gira sozinho

  function init(root) {
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
    new ResizeObserver(resize).observe(root); resize();

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

    (function loop() {
      requestAnimationFrame(loop);
      if (AUTO && !drag) az += 0.004;
      place(); stripes.rotation.y = az;
      renderer.render(scene, camera);
    })();
  }

  document.querySelectorAll('[data-copo3d]').forEach(init);
})();

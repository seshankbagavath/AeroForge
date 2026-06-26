// ============================================================
// viz.js — Visualization Layer
// Three.js 3D wing renderer (mirrored half-wings, pressure tint)
// + lightweight canvas charts (no external chart lib needed).
// ============================================================

export const Viz = (() => {

  let scene, camera, renderer, wingGroup, controls, raf;
  const PALETTE = {
    green: 0x1f4d3a, greenLite: 0x2e6b50,
    surface: 0xf2efe9, edge: 0xe7e3db, charcoal: 0x1e1c19
  };

  function initThree(container) {
    const THREE = window.THREE;
    const w = container.clientWidth, h = container.clientHeight;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xfaf9f6);

    camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
    camera.position.set(6, 4, 9);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const amb = new THREE.AmbientLight(0xffffff, 0.75);
    const dir = new THREE.DirectionalLight(0xffffff, 0.7);
    dir.position.set(5, 10, 7);
    scene.add(amb, dir);

    // ground grid (subtle)
    const grid = new THREE.GridHelper(20, 20, 0xd8d3ca, 0xe7e3db);
    grid.position.y = -2;
    scene.add(grid);

    wingGroup = new THREE.Group();
    scene.add(wingGroup);

    setupOrbit(container);
    animate();
    window.addEventListener('resize', () => onResize(container));
  }

  // Minimal orbit controls (drag to rotate, wheel to zoom)
  let theta = 0.6, phi = 0.9, radius = 11, dragging = false, lx = 0, ly = 0;
  function setupOrbit(container) {
    const el = renderer.domElement;
    el.addEventListener('pointerdown', e => { dragging = true; lx = e.clientX; ly = e.clientY; });
    window.addEventListener('pointerup', () => dragging = false);
    window.addEventListener('pointermove', e => {
      if (!dragging) return;
      theta -= (e.clientX - lx) * 0.01;
      phi = Math.max(0.15, Math.min(Math.PI - 0.15, phi - (e.clientY - ly) * 0.01));
      lx = e.clientX; ly = e.clientY;
    });
    el.addEventListener('wheel', e => {
      e.preventDefault();
      radius = Math.max(4, Math.min(30, radius + e.deltaY * 0.01));
    }, { passive: false });
  }

  function animate() {
    raf = requestAnimationFrame(animate);
    camera.position.x = radius * Math.sin(phi) * Math.cos(theta);
    camera.position.y = radius * Math.cos(phi);
    camera.position.z = radius * Math.sin(phi) * Math.sin(theta);
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
  }

  function onResize(container) {
    if (!renderer) return;
    const w = container.clientWidth, h = container.clientHeight;
    camera.aspect = w / h; camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  // Build mesh from geometry stations; colorMode: 'solid' | 'pressure' | 'stress'
  function renderWing(wing, opts = {}) {
    const THREE = window.THREE;
    while (wingGroup.children.length) wingGroup.remove(wingGroup.children[0]);

    const { stations } = wing;
    const ringLen = stations[0].ring.length;

    // build for both half-wings (mirror across y=0 → here span along Z)
    [1, -1].forEach(sign => {
      const positions = [], colors = [];
      for (let s = 0; s < stations.length - 1; s++) {
        const r0 = stations[s].ring, r1 = stations[s + 1].ring;
        for (let i = 0; i < ringLen - 1; i++) {
          const quad = [
            r0[i], r0[i + 1], r1[i],
            r1[i], r0[i + 1], r1[i + 1]
          ];
          for (const p of quad) {
            // map [x,y,z] geometry → scene (x chordwise, z spanwise)
            positions.push(p[0], p[2], sign * p[1]);
            const c = faceColor(opts, s / stations.length, i / ringLen);
            colors.push(c.r, c.g, c.b);
          }
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geo.computeVertexNormals();
      const mat = new THREE.MeshStandardMaterial({
        vertexColors: true, metalness: 0.1, roughness: 0.6, side: THREE.DoubleSide
      });
      wingGroup.add(new THREE.Mesh(geo, mat));
    });

    // center the group
    wingGroup.position.set(0, 0, 0);
  }

  function faceColor(opts, spanFrac, chordFrac) {
    const THREE = window.THREE;
    if (opts.colorMode === 'pressure') {
      // suction (low Cp) near LE upper → cool; pressure side → warm-green
      const t = Math.max(0, 1 - chordFrac * 2);
      return new THREE.Color().lerpColors(
        new THREE.Color(0x2e6b50), new THREE.Color(0xbcd9c8), t);
    }
    if (opts.colorMode === 'stress') {
      // root (spanFrac→0) = high stress = deep green→amber tint
      const t = 1 - spanFrac;
      return new THREE.Color().lerpColors(
        new THREE.Color(0xd8e3dc), new THREE.Color(0x1f4d3a), t);
    }
    return new THREE.Color(0x2e6b50);
  }

  function dispose() { if (raf) cancelAnimationFrame(raf); }

  // ---------- Canvas charts (dependency-free) ---------------
  function lineChart(canvas, series, opts = {}) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width = canvas.clientWidth * devicePixelRatio;
    const H = canvas.height = canvas.clientHeight * devicePixelRatio;
    ctx.clearRect(0, 0, W, H);
    const pad = 42 * devicePixelRatio;

    const all = series.flatMap(s => s.points);
    const xs = all.map(p => p.x), ys = all.map(p => p.y);
    const xMin = opts.xMin ?? Math.min(...xs), xMax = opts.xMax ?? Math.max(...xs);
    const yMin = opts.yMin ?? Math.min(...ys), yMax = opts.yMax ?? Math.max(...ys);
    const sx = x => pad + (x - xMin) / (xMax - xMin || 1) * (W - pad * 1.4);
    const sy = y => H - pad - (y - yMin) / (yMax - yMin || 1) * (H - pad * 1.6);

    // axes
    ctx.strokeStyle = '#e7e3db'; ctx.lineWidth = devicePixelRatio;
    ctx.beginPath();
    ctx.moveTo(pad, H - pad); ctx.lineTo(W - pad * 0.4, H - pad);
    ctx.moveTo(pad, H - pad); ctx.lineTo(pad, pad * 0.6);
    ctx.stroke();

    // gridlines + labels
    ctx.fillStyle = '#6e6a63';
    ctx.font = `${11 * devicePixelRatio}px 'Space Grotesk', sans-serif`;
    ctx.strokeStyle = '#f0ece4';
    for (let i = 0; i <= 4; i++) {
      const yy = yMin + (yMax - yMin) * i / 4;
      const py = sy(yy);
      ctx.beginPath(); ctx.moveTo(pad, py); ctx.lineTo(W - pad * 0.4, py); ctx.stroke();
      ctx.fillText(yy.toFixed(1), 4 * devicePixelRatio, py + 4 * devicePixelRatio);
    }

    // series
    for (const s of series) {
      ctx.strokeStyle = s.color || '#1f4d3a';
      ctx.lineWidth = 2 * devicePixelRatio;
      ctx.beginPath();
      s.points.forEach((p, i) => {
        const X = sx(p.x), Y = sy(p.y);
        i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
      });
      ctx.stroke();
      if (s.dots) {
        ctx.fillStyle = s.color || '#1f4d3a';
        s.points.forEach(p => {
          ctx.beginPath(); ctx.arc(sx(p.x), sy(p.y), 2.5 * devicePixelRatio, 0, 7); ctx.fill();
        });
      }
    }
    // axis titles
    ctx.fillStyle = '#1e1c19';
    ctx.font = `${12 * devicePixelRatio}px 'Space Grotesk', sans-serif`;
    if (opts.xLabel) ctx.fillText(opts.xLabel, W / 2 - 20, H - 8 * devicePixelRatio);
    if (opts.yLabel) {
      ctx.save(); ctx.translate(12 * devicePixelRatio, H / 2); ctx.rotate(-Math.PI / 2);
      ctx.fillText(opts.yLabel, 0, 0); ctx.restore();
    }
  }

  function barDist(canvas, points, opts = {}) {
    // spanwise distribution as filled area
    const ctx = canvas.getContext('2d');
    const W = canvas.width = canvas.clientWidth * devicePixelRatio;
    const H = canvas.height = canvas.clientHeight * devicePixelRatio;
    ctx.clearRect(0, 0, W, H);
    const pad = 38 * devicePixelRatio;
    const xs = points.map(p => p.x), ys = points.map(p => p.y);
    const xMin = Math.min(...xs), xMax = Math.max(...xs);
    const yMax = Math.max(...ys, 0.0001), yMin = Math.min(...ys, 0);
    const sx = x => pad + (x - xMin) / (xMax - xMin || 1) * (W - pad * 1.4);
    const sy = y => H - pad - (y - yMin) / (yMax - yMin || 1) * (H - pad * 1.6);

    ctx.fillStyle = 'rgba(46,107,80,0.18)';
    ctx.strokeStyle = '#1f4d3a'; ctx.lineWidth = 2 * devicePixelRatio;
    ctx.beginPath(); ctx.moveTo(sx(points[0].x), sy(0));
    points.forEach(p => ctx.lineTo(sx(p.x), sy(p.y)));
    ctx.lineTo(sx(points[points.length - 1].x), sy(0)); ctx.closePath();
    ctx.fill(); ctx.stroke();

    ctx.strokeStyle = '#e7e3db'; ctx.lineWidth = devicePixelRatio;
    ctx.beginPath(); ctx.moveTo(pad, sy(0)); ctx.lineTo(W - pad * 0.4, sy(0)); ctx.stroke();
    ctx.fillStyle = '#6e6a63';
    ctx.font = `${11 * devicePixelRatio}px 'Space Grotesk', sans-serif`;
    if (opts.xLabel) ctx.fillText(opts.xLabel, W / 2 - 24, H - 6 * devicePixelRatio);
  }

  return { initThree, renderWing, dispose, lineChart, barDist, onResize };
})();

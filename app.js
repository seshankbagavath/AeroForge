// ============================================================
// app.js — Application controller
// State + routing + control panels + recompute pipeline + render
// ============================================================

import { Geometry } from './geometry.js';
import { Aero } from './aero.js';
import { Structure } from './structure.js';
import { Optimizer } from './optimizer.js';
import { Viz } from './viz.js';

window.__Geometry = Geometry; // used by Aero.pressureDistribution

// ---------- Central state ----------
const state = {
  params: {
    span: 10, rootChord: 1.8, tipChord: 0.9,
    sweep: 12, twist: -3, airfoil: '2412', thickRatio: 0.12
  },
  op: { alpha: 4, V: 60 },          // angle of attack (deg), airspeed (m/s)
  loadFactor: 2.5,
  obj: { targetLift: 9000, minSafety: 1.5,
         popSize: 40, generations: 30, mutRate: 0.25 },
  colorMode: 'solid',
  results: null
};

let viewports = {};   // which Three viewport is live per page

// ---------- Compute pipeline ----------
function recompute() {
  const p = state.params;
  const planform = Geometry.planformStats(p);
  const naca = Geometry.naca4(p.airfoil);
  naca.code = p.airfoil;
  p.thickRatio = naca.t;

  const aero = Aero.solvePoint(p, planform, naca, state.op.alpha, state.op.V);
  const polar = Aero.dragPolar(p, planform, naca, state.op.V);
  const cp = Aero.pressureDistribution(naca, state.op.alpha);
  const struct = Structure.analyze(p, planform, aero, state.loadFactor);
  const wing = Geometry.buildWing(p);

  state.results = { planform, naca, aero, polar, cp, struct, wing };
  return state.results;
}

// ---------- Number format helpers ----------
const f = (n, d = 1) => Number(n).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const kpi = (label, value, unit = '', delta = '') => `
  <div class="card stat">
    <div class="stat-label">${label}</div>
    <div class="stat-value">${value}<small>${unit ? ' ' + unit : ''}</small></div>
    ${delta ? `<div class="stat-delta ${delta.startsWith('-') ? 'down' : 'up'}">${delta}</div>` : ''}
  </div>`;

// ============================================================
//  RENDERERS per page
// ============================================================
function renderDashboard() {
  const r = state.results;
  document.getElementById('kpis').innerHTML =
    kpi('Lift / Drag', f(r.aero.LD, 1), '', 'max efficiency') +
    kpi('Lift', f(r.aero.L, 0), 'N') +
    kpi('Drag', f(r.aero.D, 0), 'N') +
    kpi('Safety Factor', f(r.struct.safety, 2), '', r.struct.pass ? 'pass' : '-fail');

  ensureViewport('viewport3d');
  Viz.renderWing(r.wing, { colorMode: state.colorMode });

  // polar
  Viz.lineChart(document.getElementById('polarChart'),
    [{ points: r.polar.map(p => ({ x: p.CD, y: p.CL })), color: '#1f4d3a', dots: true }],
    { xLabel: 'C_D', yLabel: 'C_L' });

  // lift dist (positive half-span)
  const lp = r.aero.dist.filter(d => d.y >= 0).map(d => ({ x: d.y, y: Math.abs(d.lift) }));
  Viz.barDist(document.getElementById('liftChart'), lp, { xLabel: 'span (m)' });

  // Cp
  Viz.lineChart(document.getElementById('cpChart'),
    [{ points: r.cp.upper.map(p => ({ x: p.x, y: p.cp })), color: '#1f4d3a' },
     { points: r.cp.lower.map(p => ({ x: p.x, y: p.cp })), color: '#2e6b50' }],
    { xLabel: 'x/c', yLabel: 'Cp', yMin: Math.min(...r.cp.upper.map(p=>p.cp)) - 0.2, yMax: 1.1 });
}

function renderGeometry() {
  const r = state.results;
  document.getElementById('airfoilName').textContent = 'NACA ' + state.params.airfoil;
  const outline = Geometry.airfoilOutline(state.params.airfoil);
  Viz.lineChart(document.getElementById('airfoilChart'),
    [{ points: outline.map(p => ({ x: p[0], y: p[1] })), color: '#1f4d3a' }],
    { xMin: 0, xMax: 1, yMin: -0.25, yMax: 0.25 });

  document.getElementById('planformStats').innerHTML = `
    ${row('Wing area S', f(r.planform.area, 2) + ' m²')}
    ${row('Aspect ratio AR', f(r.planform.ar, 2))}
    ${row('Taper ratio λ', f(r.planform.taper, 2))}
    ${row('Mean aero chord', f(r.planform.mac, 2) + ' m')}
    ${row('Sweep', f(state.params.sweep, 0) + '°')}
    ${row('Twist (washout)', f(state.params.twist, 0) + '°')}`;

  ensureViewport('viewportGeo');
  Viz.renderWing(r.wing, { colorMode: 'solid' });
}

function renderAero() {
  const r = state.results;
  document.getElementById('aeroKpis').innerHTML =
    kpi('C_L', f(r.aero.CL, 3)) + kpi('C_D', f(r.aero.CD, 4)) +
    kpi('Induced C_Di', f(r.aero.CDi, 4)) + kpi('Span eff. e', f(r.aero.e, 3));
  Viz.lineChart(document.getElementById('ldChart'),
    [{ points: r.polar.map(p => ({ x: p.alpha, y: p.LD })), color: '#1f4d3a', dots: true }],
    { xLabel: 'α (deg)', yLabel: 'L/D' });
  const lp = r.aero.dist.filter(d => d.y >= 0).map(d => ({ x: d.y, y: Math.abs(d.lift) }));
  Viz.barDist(document.getElementById('liftChart2'), lp, { xLabel: 'span (m)' });
  Viz.lineChart(document.getElementById('cpChart2'),
    [{ points: r.cp.upper.map(p => ({ x: p.x, y: p.cp })), color: '#1f4d3a' },
     { points: r.cp.lower.map(p => ({ x: p.x, y: p.cp })), color: '#2e6b50' }],
    { xLabel: 'x/c', yLabel: 'Cp', yMax: 1.1 });
}

function renderStructure() {
  const r = state.results, s = r.struct;
  document.getElementById('structKpis').innerHTML =
    kpi('Root Moment', f(s.stations[0].moment / 1000, 1), 'kN·m') +
    kpi('Max Stress', f(s.maxStress / 1e6, 1), 'MPa') +
    kpi('Tip Deflection', f(s.tipDeflection * 1000, 1), 'mm') +
    kpi('Spar Mass', f(s.mass, 1), 'kg');
  Viz.barDist(document.getElementById('momentChart'),
    s.stations.map(st => ({ x: st.y, y: st.moment / 1000 })), { xLabel: 'span (m)' });
  Viz.lineChart(document.getElementById('stressChart'),
    [{ points: s.stations.map(st => ({ x: st.y, y: st.stress / 1e6 })), color: '#1f4d3a', dots: true },
     { points: s.stations.map(st => ({ x: st.y, y: s.material.yield / 1e6 })), color: '#b4685a' }],
    { xLabel: 'span (m)', yLabel: 'MPa' });
  const tag = s.pass ? `<span class="tag">SAFE · SF ${f(s.safety,2)}</span>`
                     : `<span class="tag warn">UNDER SF 1.5 · ${f(s.safety,2)}</span>`;
  document.getElementById('structSummary').innerHTML = `
    <div class="card-head"><div class="card-title">Assessment</div>${tag}</div>
    <div class="hint">Material: ${s.material.name} · yield ${f(s.material.yield/1e6,0)} MPa.
    Worst-loaded station at span ${f(s.worstStation.y,2)} m carrying ${f(s.worstStation.stress/1e6,1)} MPa
    at a ${state.loadFactor}g limit load. ${s.pass
      ? 'Structure meets the 1.5 safety-factor target.'
      : 'Increase thickness, reduce span, or add taper to recover margin.'}</div>`;
}

const optState = { runner: null, running: false, best: null, history: [] };
function renderOptimize() {
  document.getElementById('optKpis').innerHTML =
    kpi('Best L/D', optState.best ? f(optState.best.aero.LD, 1) : '—') +
    kpi('Generation', optState.history.length ? optState.history.length - 1 : '0') +
    kpi('Best Mass', optState.best ? f(optState.best.struct.mass, 1) : '—', 'kg') +
    kpi('Safety', optState.best ? f(optState.best.struct.safety, 2) : '—');
  if (optState.history.length)
    Viz.lineChart(document.getElementById('convChart'),
      [{ points: optState.history.map(h => ({ x: h.gen, y: h.best })), color: '#1f4d3a' },
       { points: optState.history.map(h => ({ x: h.gen, y: h.avg })), color: '#bcd0c6' }],
      { xLabel: 'generation', yLabel: 'fitness' });
  if (optState.best) {
    ensureViewport('viewportOpt');
    Viz.renderWing(Geometry.buildWing(optState.best.params), { colorMode: 'pressure' });
    const b = optState.best;
    document.getElementById('optResult').innerHTML = `
      <div class="card-head"><div class="card-title">Optimized Configuration</div>
        <span class="tag">L/D ${f(b.aero.LD,1)}</span></div>
      <div class="grid grid-3">
        <div>${row('Span', f(b.params.span,2)+' m')}${row('Root chord', f(b.params.rootChord,2)+' m')}${row('Tip chord', f(b.params.tipChord,2)+' m')}</div>
        <div>${row('Sweep', f(b.params.sweep,1)+'°')}${row('Twist', f(b.params.twist,1)+'°')}${row('Airfoil', 'NACA '+b.params.airfoil)}</div>
        <div>${row('Lift', f(b.aero.L,0)+' N')}${row('Drag', f(b.aero.D,0)+' N')}${row('Mass', f(b.struct.mass,1)+' kg')}</div>
      </div>
      <button class="btn btn-ghost" id="applyBest" style="margin-top:14px">Apply to design</button>`;
    document.getElementById('applyBest').onclick = () => {
      Object.assign(state.params, b.params); syncControls(); refresh('dashboard'); go('dashboard');
    };
  }
}

const row = (k, v) => `<div class="row"><span class="k">${k}</span><span class="v">${v}</span></div>`;

// ============================================================
//  CONTROL PANELS (right context pane) per page
// ============================================================
function slider(id, label, min, max, step, val, unit = '') {
  return `<div class="field"><label>${label}<span id="${id}-val">${val}${unit}</span></label>
    <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}"></div>`;
}

function buildControls(page) {
  const c = document.getElementById('contextPanel');
  const p = state.params, o = state.op;
  if (page === 'optimize') {
    c.innerHTML = `<h3>Objectives</h3>
      ${slider('targetLift','Target lift',2000,20000,500,state.obj.targetLift,' N')}
      ${slider('minSafety','Min safety factor',1.2,3,0.1,state.obj.minSafety)}
      <div class="divider"></div><h3>GA Settings</h3>
      ${slider('popSize','Population',20,80,5,state.obj.popSize)}
      ${slider('generations','Generations',10,80,5,state.obj.generations)}
      ${slider('mutRate','Mutation rate',0.05,0.6,0.05,state.obj.mutRate)}
      <button class="btn btn-primary" id="runOpt">Run optimization</button>
      <div class="progress" style="margin-top:12px"><div id="optProg"></div></div>
      <div class="hint" style="margin-top:8px">Operating point: α ${o.alpha}° · V ${o.V} m/s</div>`;
    bindObj(); document.getElementById('runOpt').onclick = runOptimizer;
    return;
  }
  // shared design controls
  c.innerHTML = `<h3>Planform</h3>
    ${slider('span','Wing span',4,16,0.5,p.span,' m')}
    ${slider('rootChord','Root chord',0.8,3,0.1,p.rootChord,' m')}
    ${slider('tipChord','Tip chord',0.3,2,0.1,p.tipChord,' m')}
    ${slider('sweep','Sweep angle',0,35,1,p.sweep,'°')}
    ${slider('twist','Twist',-6,0,0.5,p.twist,'°')}
    <div class="divider"></div><h3>Airfoil</h3>
    <div class="field"><label>NACA 4-digit</label>
      <select id="airfoil">
        ${['0012','2412','2415','4412','4415','6409','23012']
          .map(a => `<option ${a===p.airfoil?'selected':''}>${a}</option>`).join('')}
      </select></div>
    <div class="divider"></div><h3>Operating point</h3>
    ${slider('alpha','Angle of attack',-4,16,0.5,o.alpha,'°')}
    ${slider('V','Airspeed',20,120,5,o.V,' m/s')}
    ${slider('loadFactor','Load factor',1,4,0.5,state.loadFactor,' g')}`;
  bindDesign(page);
}

function bindDesign(page) {
  const bind = (id, obj, key, unit = '', fn = parseFloat) => {
    const el = document.getElementById(id); if (!el) return;
    el.oninput = () => {
      obj[key] = fn(el.value);
      const lab = document.getElementById(id + '-val'); if (lab) lab.textContent = el.value + unit;
      if (key === 'tipChord' && obj[key] > state.params.rootChord) {} // allow; clamp in compute
      refresh(page);
    };
  };
  bind('span', state.params, 'span', ' m');
  bind('rootChord', state.params, 'rootChord', ' m');
  bind('tipChord', state.params, 'tipChord', ' m');
  bind('sweep', state.params, 'sweep', '°');
  bind('twist', state.params, 'twist', '°');
  bind('alpha', state.op, 'alpha', '°');
  bind('V', state.op, 'V', ' m/s');
  bind('loadFactor', state, 'loadFactor', ' g');
  const af = document.getElementById('airfoil');
  if (af) af.onchange = () => { state.params.airfoil = af.value; refresh(page); };
}
function bindObj() {
  const bind = (id, key, unit = '') => {
    const el = document.getElementById(id);
    el.oninput = () => { state.obj[key] = parseFloat(el.value);
      document.getElementById(id + '-val').textContent = el.value + unit; };
  };
  bind('targetLift', 'targetLift', ' N'); bind('minSafety', 'minSafety');
  bind('popSize', 'popSize'); bind('generations', 'generations'); bind('mutRate', 'mutRate');
}
function syncControls() { buildControls(currentPage); }

// ============================================================
//  OPTIMIZER RUN (async, animated)
// ============================================================
function runOptimizer() {
  const btn = document.getElementById('runOpt');
  btn.disabled = true; btn.textContent = 'Running…';
  optState.history = []; optState.best = null;
  const cfg = {
    alpha: state.op.alpha, V: state.op.V, loadFactor: state.loadFactor,
    targetLift: state.obj.targetLift, minSafety: state.obj.minSafety,
    popSize: state.obj.popSize, generations: state.obj.generations,
    mutRate: state.obj.mutRate
  };
  startTracked(cfg, btn);
}

// Tracked run using onGen callback — animates one generation per frame.
function startTracked(cfg, btn) {
  optState.history = []; optState.best = null;
  const runner = Optimizer.run(cfg, (gen, best, history) => {
    optState.best = best; optState.history = history.slice();
    document.getElementById('genLabel').textContent = 'gen ' + gen;
    document.getElementById('optProg').style.width =
      (100 * (gen + 1) / cfg.generations) + '%';
    renderOptimize();
  });
  function loop() {
    const done = runner.step();
    if (done) { btn.disabled = false; btn.textContent = 'Run optimization'; return; }
    requestAnimationFrame(loop);
  }
  loop();
}

// ============================================================
//  Three.js viewport management (single live renderer)
// ============================================================
let activeContainer = null;
function ensureViewport(id) {
  const el = document.getElementById(id);
  if (activeContainer === el) return;
  Viz.dispose();
  Viz.initThree(el);
  activeContainer = el;
}

// ============================================================
//  Routing
// ============================================================
let currentPage = 'dashboard';
function refresh(page) {
  recompute();
  ({ dashboard: renderDashboard, geometry: renderGeometry, aero: renderAero,
     structure: renderStructure, optimize: renderOptimize }[page] || renderDashboard)();
}
function go(page) {
  currentPage = page;
  document.querySelectorAll('.nav-item').forEach(n =>
    n.classList.toggle('active', n.dataset.page === page));
  document.querySelectorAll('.page').forEach(p =>
    p.classList.toggle('active', p.id === 'page-' + page));
  activeContainer = null;                 // force viewport re-init on page
  buildControls(page);
  refresh(page);
}

document.querySelectorAll('.nav-item').forEach(n =>
  n.addEventListener('click', () => go(n.dataset.page)));

document.getElementById('colorMode').addEventListener('click', e => {
  const btn = e.target.closest('button'); if (!btn) return;
  state.colorMode = btn.dataset.mode;
  document.querySelectorAll('#colorMode button').forEach(b =>
    b.classList.toggle('active', b === btn));
  if (state.results) Viz.renderWing(state.results.wing, { colorMode: state.colorMode });
});

// boot
go('dashboard');

// ============================================================
// ui.js — presentational shell behaviors only.
// Drawers, header stepper sync, help dialog, first-run guide.
// Does NOT touch the compute pipeline (app.js owns that).
// ============================================================

const app = document.querySelector('.app');
const scrim = document.getElementById('scrim');

// ---------- Routing helper: reuse app.js's nav buttons ----------
const navItems = [...document.querySelectorAll('.nav-item')];
function goTo(page) {
  const item = navItems.find(n => n.dataset.page === page);
  if (item) item.click();          // app.js handles the actual routing
}

// Any element with [data-page] outside the sidebar (stepper, guide) navigates.
document.querySelectorAll('.step[data-page], .guide-step[data-page]').forEach(el => {
  el.addEventListener('click', () => { goTo(el.dataset.page); closeDrawers(); });
});

// ---------- Mirror active page → header stepper + aria-current ----------
const steps = [...document.querySelectorAll('.step')];
function syncActive() {
  const active = document.querySelector('.nav-item.active');
  const page = active ? active.dataset.page : 'dashboard';
  steps.forEach(s => s.classList.toggle('active', s.dataset.page === page));
  navItems.forEach(n =>
    n.classList.contains('active') ? n.setAttribute('aria-current', 'page')
                                   : n.removeAttribute('aria-current'));
}
// app.js toggles .active on nav-items; observe that to stay in sync.
new MutationObserver(syncActive).observe(document.querySelector('.sidebar nav'),
  { subtree: true, attributes: true, attributeFilter: ['class'] });
syncActive();

// Close the mobile nav drawer after picking a destination.
navItems.forEach(n => n.addEventListener('click', closeDrawers));

// ---------- Live operating-point chip (reads the controls' labels) ----------
const opChipText = document.getElementById('opChipText');
function refreshOpChip() {
  const a = document.getElementById('alpha-val');
  const v = document.getElementById('V-val');
  if (a && v) opChipText.textContent = `α ${a.textContent} · V ${v.textContent}`;
}
document.addEventListener('input', e => {
  if (['alpha', 'V'].includes(e.target.id)) refreshOpChip();
});
// app.js rebuilds controls on navigation; catch that too.
new MutationObserver(refreshOpChip).observe(document.getElementById('contextPanel'),
  { childList: true });
refreshOpChip();

// ---------- Mobile drawers ----------
function openDrawer(which) {
  app.classList.add(which);
  scrim.hidden = false;
  const btn = which === 'nav-open' ? menuToggle : controlsToggle;
  btn.setAttribute('aria-expanded', 'true');
}
function closeDrawers() {
  app.classList.remove('nav-open', 'controls-open');
  scrim.hidden = true;
  menuToggle.setAttribute('aria-expanded', 'false');
  controlsToggle.setAttribute('aria-expanded', 'false');
}
const menuToggle = document.getElementById('menuToggle');
const controlsToggle = document.getElementById('controlsToggle');
menuToggle.addEventListener('click', () => openDrawer('nav-open'));
controlsToggle.addEventListener('click', () => openDrawer('controls-open'));
document.getElementById('controlsClose').addEventListener('click', closeDrawers);
scrim.addEventListener('click', closeDrawers);

// ---------- First-run guide (dismissible, remembered) ----------
const guide = document.getElementById('startGuide');
if (guide && !localStorage.getItem('aeroforge.guideDismissed')) guide.hidden = false;
document.getElementById('guideDismiss')?.addEventListener('click', () => {
  guide.hidden = true;
  localStorage.setItem('aeroforge.guideDismissed', '1');
});

// ---------- Help dialog ----------
const helpModal = document.getElementById('helpModal');
let lastFocus = null;
function openHelp() {
  lastFocus = document.activeElement;
  helpModal.hidden = false;
  document.getElementById('helpClose').focus();
}
function closeHelp() {
  helpModal.hidden = true;
  if (lastFocus) lastFocus.focus();
}
document.getElementById('helpBtn').addEventListener('click', openHelp);
document.getElementById('helpClose').addEventListener('click', closeHelp);
helpModal.querySelector('[data-close]').addEventListener('click', closeHelp);

// ---------- Global keyboard: Esc closes whatever's open ----------
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!helpModal.hidden) closeHelp();
  else if (app.classList.contains('nav-open') || app.classList.contains('controls-open')) closeDrawers();
});

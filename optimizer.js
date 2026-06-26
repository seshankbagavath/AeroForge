// ============================================================
// optimizer.js — Optimization Engine (Genetic Algorithm)
// Evolves wing parameters to maximize a multi-objective fitness:
// high L/D, low weight, structural safety, target lift constraint.
// ============================================================

import { Geometry } from './geometry.js';
import { Aero } from './aero.js';
import { Structure } from './structure.js';

export const Optimizer = (() => {

  // Parameter bounds (gene space)
  const BOUNDS = {
    span:      [4, 16],
    rootChord: [0.8, 3.0],
    tipChord:  [0.3, 2.0],
    sweep:     [0, 35],
    twist:     [-6, 0],
    airfoilT:  [8, 18]   // thickness % for NACA 24xx family
  };

  const KEYS = Object.keys(BOUNDS);
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function randomGenome() {
    const g = {};
    for (const k of KEYS) g[k] = rand(BOUNDS[k][0], BOUNDS[k][1]);
    // enforce tip <= root
    if (g.tipChord > g.rootChord) g.tipChord = g.rootChord * 0.6;
    return g;
  }

  function genomeToParams(g) {
    const tPct = Math.round(g.airfoilT);
    const airfoil = `24${String(tPct).padStart(2, '0')}`; // NACA 24xx
    return {
      span: g.span,
      rootChord: g.rootChord,
      tipChord: Math.min(g.tipChord, g.rootChord),
      sweep: g.sweep,
      twist: g.twist,
      airfoil,
      thickRatio: tPct / 100
    };
  }

  // Evaluate one genome at a cruise operating point.
  function evaluate(g, cfg) {
    const params = genomeToParams(g);
    const planform = Geometry.planformStats(params);
    const naca = Geometry.naca4(params.airfoil);
    naca.code = params.airfoil;

    const aero = Aero.solvePoint(params, planform, naca, cfg.alpha, cfg.V);
    const struct = Structure.analyze(params, planform, aero, cfg.loadFactor);

    // required lift to fly (weight support)
    const liftMargin = aero.L / (cfg.targetLift || 1);

    // multi-objective fitness ------------------------------
    let fit = 0;
    fit += aero.LD * 2.0;                                  // reward efficiency
    fit -= struct.mass * 0.05;                             // penalize weight
    if (struct.safety < cfg.minSafety)                     // safety constraint
      fit -= (cfg.minSafety - struct.safety) * 40;
    if (liftMargin < 1)                                    // must make target lift
      fit -= (1 - liftMargin) * 60;
    if (aero.CL > 1.4) fit -= (aero.CL - 1.4) * 30;        // stall guard

    return { genome: g, params, planform, aero, struct, fitness: fit, liftMargin };
  }

  // GA operators
  function crossover(a, b) {
    const c = {};
    for (const k of KEYS) c[k] = Math.random() < 0.5 ? a[k] : b[k];
    return c;
  }
  function mutate(g, rate, scale) {
    const m = { ...g };
    for (const k of KEYS) {
      if (Math.random() < rate) {
        const [lo, hi] = BOUNDS[k];
        m[k] = clamp(m[k] + (Math.random() - 0.5) * (hi - lo) * scale, lo, hi);
      }
    }
    return m;
  }
  function tournament(pop, k = 3) {
    let best = null;
    for (let i = 0; i < k; i++) {
      const c = pop[Math.floor(Math.random() * pop.length)];
      if (!best || c.fitness > best.fitness) best = c;
    }
    return best.genome;
  }

  // Run the GA. onGen(gen, bestEval, history) called each generation.
  function run(cfg, onGen) {
    const popSize = cfg.popSize || 40;
    const gens = cfg.generations || 30;
    const eliteN = Math.max(2, Math.round(popSize * 0.1));

    let pop = Array.from({ length: popSize }, () => evaluate(randomGenome(), cfg));
    const history = [];

    let gen = 0;
    function step() {
      pop.sort((a, b) => b.fitness - a.fitness);
      const best = pop[0];
      history.push({ gen, best: best.fitness, avg: pop.reduce((s, p) => s + p.fitness, 0) / pop.length,
                     LD: best.aero.LD, mass: best.struct.mass });
      if (onGen) onGen(gen, best, history);

      if (gen >= gens - 1) return { best, history };

      const next = pop.slice(0, eliteN);                  // elitism
      while (next.length < popSize) {
        const p1 = tournament(pop), p2 = tournament(pop);
        let child = crossover(p1, p2);
        child = mutate(child, cfg.mutRate || 0.25, cfg.mutScale || 0.3);
        if (child.tipChord > child.rootChord) child.tipChord = child.rootChord * 0.6;
        next.push(evaluate(child, cfg));
      }
      pop = next;
      gen++;
      return null;
    }

    return { step, getState: () => ({ gen, history }) };
  }

  return { run, evaluate, randomGenome, genomeToParams, BOUNDS };
})();

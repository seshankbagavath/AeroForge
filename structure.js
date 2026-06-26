// ============================================================
// structure.js — Structural Load Estimator
// Models the half-wing as a cantilever beam (Euler-Bernoulli).
// Integrates the aero lift distribution → shear, bending moment,
// bending stress, tip deflection, and a safety factor.
// ============================================================

export const Structure = (() => {

  // Material defaults: aluminium 6061-T6
  const MATERIAL = {
    name: 'Al 6061-T6',
    E: 68.9e9,        // Young's modulus (Pa)
    yield: 276e6,     // yield stress (Pa)
    rho: 2700         // density (kg/m^3)
  };

  // Approximate spar as a box section scaling with local chord & thickness.
  // Returns section modulus Z and second moment I at a station.
  function sectionProps(chord, thickRatio) {
    const h = thickRatio * chord * 0.8;   // spar height ≈ 80% of airfoil thickness
    const w = chord * 0.12;               // spar cap width ≈ 12% chord
    const tWall = Math.max(h * 0.08, 0.002);
    // box: outer minus inner
    const I = (w * Math.pow(h, 3) - (w - 2 * tWall) * Math.pow(h - 2 * tWall, 3)) / 12;
    const Z = I / (h / 2);
    const area = w * h - (w - 2 * tWall) * (h - 2 * tWall);
    return { I, Z, h, area };
  }

  // Integrate lift distribution from tip→root to get shear & moment.
  // dist: [{y, lift(N/m)}] over the half-span (y >= 0 side used).
  function analyze(params, planform, aero, loadFactor = 2.5, material = MATERIAL) {
    // Build a monotonic half-span lift profile (use positive y side)
    const half = aero.dist
      .filter(d => d.y >= 0)
      .sort((a, b) => a.y - b.y);
    if (half.length < 2) return null;

    const halfSpan = planform ? (params.span / 2) : Math.max(...half.map(d => d.y));
    const n = half.length;

    // local chord & section at each station
    const stations = half.map(d => {
      const frac = d.y / halfSpan;
      const chord = params.rootChord + (params.tipChord - params.rootChord) * frac;
      const sec = sectionProps(chord, params.thickRatio ?? 0.12);
      return { y: d.y, chord, lift: Math.abs(d.lift) * loadFactor, sec };
    });

    // Integrate from tip inward: shear V(y), moment M(y)
    let V = 0, M = 0;
    for (let i = n - 1; i >= 0; i--) {
      const dy = i === n - 1 ? (stations[i].y - stations[i - 1].y)
                             : (stations[i + 1].y - stations[i].y);
      V += stations[i].lift * dy;             // running shear
      M += V * dy;                            // running moment
      stations[i].shear = V;
      stations[i].moment = M;
      stations[i].stress = M / stations[i].sec.Z;  // σ = M / Z
    }

    // Tip deflection via moment-area (numerical double integration of M/EI)
    let slope = 0, defl = 0;
    for (let i = 0; i < n - 1; i++) {
      const dy = stations[i + 1].y - stations[i].y;
      const EI = material.E * stations[i].sec.I;
      const curv = stations[i].moment / EI;
      slope += curv * dy;
      defl += slope * dy;
    }

    const maxStress = Math.max(...stations.map(s => s.stress));
    const rootStress = stations[0].stress;
    const safety = material.yield / maxStress;

    // structural mass of spar (both halves)
    let mass = 0;
    for (let i = 0; i < n - 1; i++) {
      const dy = stations[i + 1].y - stations[i].y;
      mass += stations[i].sec.area * dy * material.rho;
    }
    mass *= 2;

    // worst (most loaded) station index
    let worst = 0;
    stations.forEach((s, i) => { if (s.stress > stations[worst].stress) worst = i; });

    return {
      stations, maxStress, rootStress, safety,
      tipDeflection: defl, mass, material,
      worstStation: stations[worst],
      pass: safety >= 1.5
    };
  }

  return { analyze, sectionProps, MATERIAL };
})();

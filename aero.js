// ============================================================
// aero.js — Aerodynamic Simulator (Physics Engine)
// Reduced-order model: thin-airfoil + Prandtl lifting-line theory
// Gives Cl, Cd, L/D, spanwise lift distribution, Cp over chord.
// ============================================================

export const Aero = (() => {

  const RHO = 1.225;   // air density kg/m^3 (sea level)
  const MU  = 1.81e-5; // dynamic viscosity

  // --- Thin airfoil: 2D lift-curve slope & zero-lift angle ---
  // For cambered NACA, alpha0 ≈ -(camber effect). Approximate.
  function airfoil2D(naca) {
    const a0 = 2 * Math.PI;               // ideal 2D slope (per rad)
    // zero-lift angle approx from camber (deg) — empirical for 4-digit
    const alpha0_deg = -naca.m * 100 * 1.1; // more camber → more negative
    return { a0, alpha0: alpha0_deg * Math.PI / 180 };
  }

  // --- Prandtl lifting-line (monoplane equation, Fourier series) ---
  // Solves for circulation distribution → CL, induced drag (CDi),
  // spanwise lift, and span efficiency e.
  function liftingLine(params, planform, alphaDeg, V, naca, N = 24) {
    const { span } = params;
    const { area, ar } = planform;
    const { a0, alpha0 } = airfoil2D(naca);
    const alpha = alphaDeg * Math.PI / 180;
    const b = span;

    // control points along half-span via theta (avoid endpoints)
    const theta = [], yLoc = [], chordLoc = [];
    for (let i = 1; i <= N; i++) {
      const th = i * Math.PI / (N + 1);
      theta.push(th);
      const y = -(b / 2) * Math.cos(th);
      yLoc.push(y);
      const frac = Math.abs(y) / (b / 2);
      chordLoc.push(params.rootChord + (params.tipChord - params.rootChord) * frac);
    }

    // Build linear system A·a = rhs for odd+even Fourier coeffs
    const A = [], rhs = [];
    for (let i = 0; i < N; i++) {
      const c = chordLoc[i], th = theta[i];
      const mu = (a0 * c) / (4 * b);
      const row = [];
      for (let j = 0; j < N; j++) {
        const n = j + 1;
        row.push(Math.sin(n * th) * (1 + mu * n / Math.sin(th)));
      }
      A.push(row);
      rhs.push(mu * (alpha - alpha0)); // geometric - zero-lift
    }

    const a = solve(A, rhs);

    // CL from first coefficient
    const CL = Math.PI * ar * a[0];

    // induced drag factor delta = sum n*(An/A1)^2
    let delta = 0;
    for (let n = 2; n <= N; n++) delta += n * Math.pow(a[n - 1] / a[0], 2);
    const e = 1 / (1 + delta);                 // span efficiency
    const CDi = (CL * CL) / (Math.PI * ar * e);

    // spanwise circulation Γ(θ) = 2bV Σ An sin(nθ) → local lift
    const dist = theta.map((th, i) => {
      let g = 0;
      for (let n = 1; n <= N; n++) g += a[n - 1] * Math.sin(n * th);
      const gamma = 2 * b * V * g;
      const lLocal = RHO * V * gamma;          // local lift per unit span
      return { y: yLoc[i], lift: lLocal, gamma };
    });

    return { CL, CDi, e, dist, a };
  }

  // --- Parasite drag (flat-plate + form factor, very approximate) ---
  function parasiteDrag(planform, V, naca) {
    const Re = RHO * V * planform.mac / MU;
    const Cf = 0.074 / Math.pow(Math.max(Re, 1e4), 0.2);   // turbulent flat plate
    const ff = 1 + 2.7 * naca.t + 100 * Math.pow(naca.t, 4); // form factor
    const CD0 = Cf * ff * 2.0;   // wetted-area factor ~2
    return { CD0, Re };
  }

  // --- Full aero solve at one operating point ---------------
  function solvePoint(params, planform, naca, alphaDeg, V) {
    const ll = liftingLine(params, planform, alphaDeg, V, naca);
    const pd = parasiteDrag(planform, V, naca);
    const CD = ll.CDi + pd.CD0;
    const q = 0.5 * RHO * V * V;
    const L = ll.CL * q * planform.area;
    const D = CD * q * planform.area;
    return {
      CL: ll.CL, CDi: ll.CDi, CD0: pd.CD0, CD,
      LD: ll.CL / CD, L, D, e: ll.e, Re: pd.Re,
      dist: ll.dist, q
    };
  }

  // --- Drag polar sweep across alpha ------------------------
  function dragPolar(params, planform, naca, V, aMin = -4, aMax = 16, step = 1) {
    const pts = [];
    for (let a = aMin; a <= aMax + 1e-9; a += step) {
      const r = solvePoint(params, planform, naca, a, V);
      pts.push({ alpha: a, CL: r.CL, CD: r.CD, LD: r.LD });
    }
    return pts;
  }

  // --- Surface pressure coefficient over chord --------------
  // Thin-airfoil-inspired Cp from local velocity ratio (illustrative).
  function pressureDistribution(naca, alphaDeg, n = 60) {
    const Geometry = window.__Geometry;
    const af = Geometry.naca4(naca.code || `${Math.round(naca.m*100)}${Math.round(naca.p*10)}${String(Math.round(naca.t*100)).padStart(2,'0')}`, n);
    const alpha = alphaDeg * Math.PI / 180;
    const upper = [], lower = [];
    for (let i = 0; i < af.xu.length; i++) {
      const x = af.xu[i];
      // velocity perturbation grows near LE; camber + alpha bias upper suction
      const le = Math.sqrt(Math.max(1 - x, 0.0001));
      const vU = 1 + (0.6 * af.yu[i] * 6 + 0.5 * Math.sin(alpha) * 4) * le;
      const vL = 1 - (0.6 * Math.abs(af.yl[i]) * 6 + 0.5 * Math.sin(alpha) * 2) * le;
      upper.push({ x, cp: 1 - vU * vU });
      lower.push({ x, cp: 1 - vL * vL });
    }
    return { upper, lower };
  }

  // --- Tiny linear solver (Gaussian elimination w/ pivot) ---
  function solve(A, b) {
    const n = b.length;
    const M = A.map((row, i) => [...row, b[i]]);
    for (let c = 0; c < n; c++) {
      let piv = c;
      for (let r = c + 1; r < n; r++)
        if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
      [M[c], M[piv]] = [M[piv], M[c]];
      const d = M[c][c] || 1e-12;
      for (let r = 0; r < n; r++) {
        if (r === c) continue;
        const f = M[r][c] / d;
        for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
      }
    }
    return M.map((row, i) => row[n] / (row[i] || 1e-12));
  }

  return { RHO, solvePoint, dragPolar, liftingLine, pressureDistribution, airfoil2D };
})();

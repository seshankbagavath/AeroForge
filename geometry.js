// ============================================================
// geometry.js — Wing Generator (Geometry Engine)
// NACA 4-digit airfoil generation + 3D wing planform construction
// ============================================================

export const Geometry = (() => {

  // --- NACA 4-digit airfoil ---------------------------------
  // code e.g. "2412": m=2%, p=40%, t=12%
  // Returns {xu, yu, xl, yl, camber} arrays of n points (0..1 chord)
  function naca4(code, n = 80) {
    const m = parseInt(code[0], 10) / 100;       // max camber
    const p = parseInt(code[1], 10) / 10;        // camber position
    const t = parseInt(code.slice(2), 10) / 100; // thickness

    const xu = [], yu = [], xl = [], yl = [], camber = [];

    // cosine spacing for finer leading-edge resolution
    for (let i = 0; i < n; i++) {
      const beta = Math.PI * i / (n - 1);
      const x = 0.5 * (1 - Math.cos(beta));

      // thickness distribution
      const yt = 5 * t * (0.2969 * Math.sqrt(x)
        - 0.1260 * x
        - 0.3516 * x * x
        + 0.2843 * x * x * x
        - 0.1015 * x * x * x * x);

      // mean camber line + slope
      let yc = 0, dyc = 0;
      if (x < p && p > 0) {
        yc = (m / (p * p)) * (2 * p * x - x * x);
        dyc = (2 * m / (p * p)) * (p - x);
      } else if (p > 0) {
        yc = (m / ((1 - p) * (1 - p))) * ((1 - 2 * p) + 2 * p * x - x * x);
        dyc = (2 * m / ((1 - p) * (1 - p))) * (p - x);
      }
      const theta = Math.atan(dyc);

      xu.push(x - yt * Math.sin(theta));
      yu.push(yc + yt * Math.cos(theta));
      xl.push(x + yt * Math.sin(theta));
      yl.push(yc - yt * Math.cos(theta));
      camber.push({ x, yc });
    }
    return { xu, yu, xl, yl, camber, m, p, t };
  }

  // Single closed outline (upper reversed + lower) for 2D plotting
  function airfoilOutline(code, n = 80) {
    const a = naca4(code, n);
    const pts = [];
    for (let i = a.xu.length - 1; i >= 0; i--) pts.push([a.xu[i], a.yu[i]]);
    for (let i = 0; i < a.xl.length; i++) pts.push([a.xl[i], a.yl[i]]);
    return pts;
  }

  // --- Wing planform ----------------------------------------
  // params: {span, rootChord, tipChord, sweep(deg), airfoil, twist(deg)}
  // Builds left+right half-wings as a lofted set of airfoil sections.
  function buildWing(params, sections = 12, nAir = 60) {
    const { span, rootChord, tipChord, sweep, airfoil, twist = 0 } = params;
    const halfSpan = span / 2;
    const sweepRad = sweep * Math.PI / 180;

    const stations = [];
    for (let s = 0; s <= sections; s++) {
      const frac = s / sections;                 // 0 at root → 1 at tip
      const y = frac * halfSpan;                  // spanwise position
      const chord = rootChord + (tipChord - rootChord) * frac;
      const xLE = y * Math.tan(sweepRad);         // leading-edge sweep offset
      const tw = (twist * Math.PI / 180) * frac;  // washout

      const af = naca4(airfoil, nAir);
      const ring = [];
      const push = (xa, ya) => {
        // scale to chord, apply twist about quarter-chord, translate
        const cx = (xa - 0.25) * chord;
        const cz = ya * chord;
        const xr = cx * Math.cos(tw) - cz * Math.sin(tw);
        const zr = cx * Math.sin(tw) + cz * Math.cos(tw);
        ring.push([xLE + xr + 0.25 * chord, y, zr]);
      };
      for (let i = 0; i < af.xu.length; i++) push(af.xu[i], af.yu[i]);
      for (let i = af.xl.length - 1; i >= 0; i--) push(af.xl[i], af.yl[i]);
      stations.push({ y, chord, xLE, ring });
    }
    return { stations, params, halfSpan };
  }

  // Planform-derived quantities
  function planformStats(params) {
    const { span, rootChord, tipChord, sweep } = params;
    const area = span * (rootChord + tipChord) / 2;     // S
    const ar = (span * span) / area;                     // aspect ratio
    const taper = tipChord / rootChord;
    const mac = (2 / 3) * rootChord *
      (1 + taper + taper * taper) / (1 + taper);          // mean aero chord
    return { area, ar, taper, mac, sweep };
  }

  return { naca4, airfoilOutline, buildWing, planformStats };
})();

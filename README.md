# AeroForge — AI-Powered Aircraft Wing Design Platform

A computational aircraft wing design system that generates wing geometry, simulates
airflow, estimates structural loads, and evolves an optimal design with a genetic
algorithm — all running **entirely in the browser**. No server, no build step.
Deployable to GitHub Pages as static files.

> A simplified, physics-inspired take on the kind of internal design tools used at
> Boeing / NASA / Airbus — built to be transparent and educational rather than
> production CFD.

## Live modules

| Module | What it does | Method |
|--------|--------------|--------|
| **Geometry Engine** | Builds NACA 4-digit airfoils + 3D wing planform | Analytic NACA equations, cosine spacing, lofted sections |
| **Aerodynamic Simulator** | Lift, drag, pressure, spanwise distribution | Prandtl lifting-line theory + thin-airfoil + flat-plate parasite drag |
| **Structural Estimator** | Shear, bending moment, stress, deflection | Euler-Bernoulli cantilever beam, box-spar section properties |
| **Genetic Optimizer** | Evolves planform + airfoil for best L/D | GA: tournament selection, crossover, mutation, elitism |
| **3D Visualization** | Interactive wing with pressure/stress coloring | Three.js (r128) |
| **Performance Dashboard** | KPIs, drag polar, convergence, Cp graphs | Dependency-free canvas charts |

## Engineering model (what's actually computed)

- **Aerodynamics** — Prandtl monoplane lifting-line equation solved as a Fourier
  series (Gaussian elimination), giving `CL`, induced drag `CDi`, span efficiency
  `e`, and the spanwise lift distribution. Parasite drag from a turbulent
  flat-plate skin-friction estimate with a thickness form factor.
- **Structure** — the half-wing is treated as a cantilever. The aero lift
  distribution is integrated tip→root into shear `V(y)` and bending moment `M(y)`;
  bending stress `σ = M/Z` uses a chord-scaled box-spar section. Tip deflection via
  numerical double-integration of `M/EI`. Reports a yield safety factor.
- **Optimization** — multi-objective fitness rewards L/D, penalizes mass, and
  enforces a minimum safety factor and a target-lift constraint.

> ⚠️ This is a **reduced-order** model. It captures the right trends and is great
> for teaching, intuition, and design-space exploration — it is **not** a
> Navier-Stokes CFD solver and shouldn't be used for certification.

## Architecture

```
Input params ─► Geometry engine ─► Physics engine ─► Structural model
                                          │                  │
                                          └──► Optimizer ◄────┘
                                                   │
                                          Visualization layer
```

All state lives in `app.js`; each module is an independent ES module.

## Run locally

It's all static — just serve the folder:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

(Opening `index.html` directly via `file://` won't work because ES modules need
HTTP. Any static server works.)

## Deploy to GitHub Pages

1. Push this repo to GitHub.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
3. The included workflow (`.github/workflows/deploy.yml`) publishes on every push
   to `main`. Your site goes live at `https://<user>.github.io/<repo>/`.

The `.nojekyll` file ensures the `js/` folder is served untouched.

## Tech

Vanilla JS (ES modules) · Three.js r128 · zero build tooling · zero backend.

## File map

```
index.html          3-pane app shell
css/styles.css      design system (white/beige + forest green)
js/geometry.js      NACA airfoils + wing construction
js/aero.js          lifting-line aerodynamics
js/structure.js     beam-theory structural model
js/optimizer.js     genetic algorithm
js/viz.js           Three.js 3D + canvas charts
js/app.js           controller: state, routing, controls, render
```

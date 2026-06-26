# AeroForge — AI-Powered Aircraft Wing Design Platform

An interactive aircraft wing design system that generates wing geometry, simulates
airflow, estimates structural loads, and evolves an optimal design with a genetic
algorithm — running **entirely in the browser** from a single HTML file. No server,
no build step, no dependencies to install.

> A simplified, physics-inspired take on the kind of internal design tools used at
> Boeing / NASA / Airbus — built to be transparent and approachable rather than
> production CFD.

## ✨ Try it

- **On the web:** open the GitHub Pages link for this repo.
- **Locally:** just double-click `index.html`. That's it — it works straight from
  your file system because everything is inlined into one file.

The app opens on a plain-language landing page that explains what it does, then
**Open the platform** takes you into the tool.

## What it does — in five steps

1. **Shape the wing** — sliders for span, chord, sweep, twist and airfoil; the wing
   rebuilds in interactive 3D as you move them.
2. **Simulate the air** — estimates lift, drag, pressure and the spanwise lift
   distribution.
3. **Check the strength** — treats the wing as a beam and computes bending stress,
   deflection and a safety factor.
4. **Evolve the best** — a genetic algorithm breeds hundreds of designs, keeping the
   efficient, structurally-sound ones.
5. **Read the results** — a clean dashboard with plain-English explanations under
   every chart.

## Engineering model (what's actually computed)

- **Aerodynamics** — Prandtl lifting-line theory solved as a Fourier series, giving
  lift coefficient, induced drag, span efficiency and the lift distribution; plus a
  turbulent flat-plate parasite-drag estimate with a thickness form factor.
- **Structure** — the half-wing is a cantilever beam. The lift distribution is
  integrated tip→root into shear and bending moment; bending stress `σ = M/Z` uses a
  chord-scaled box-spar section; tip deflection from numerical `M/EI` integration.
- **Optimization** — a genetic algorithm (tournament selection, crossover, mutation,
  elitism) with a multi-objective fitness rewarding lift-to-drag while penalizing
  weight and enforcing safety + target-lift constraints.

> ⚠️ This is a **reduced-order** model — it captures the right physical trends and is
> great for intuition, teaching and design-space exploration. It is **not** a
> Navier-Stokes CFD solver and shouldn't be used for certification.

## Architecture

```
Input params ─► Geometry engine ─► Aerodynamics ─► Structural model
                                         │                │
                                         └──► Optimizer ◄──┘
                                                  │
                                         Visualization layer
```

Everything lives in `index.html`: the design system (CSS), the engines, the Three.js
3D renderer, the dependency-free canvas charts, and the UI controller — all inlined.

## Deploy to GitHub Pages

1. Push this repo to GitHub.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
3. The included workflow (`.github/workflows/deploy.yml`) publishes on every push to
   `main`. Your site goes live at `https://<user>.github.io/<repo>/`.

The `.nojekyll` file is included so GitHub Pages serves the file untouched.

## Tech

Vanilla JS · Three.js r128 (**self-hosted**, no CDN) · self-hosted Geist + Space
Grotesk fonts · zero build tooling · zero backend · nothing loaded from third
parties. If WebGL is unavailable, the 3D panel shows a friendly notice and the rest
of the app keeps working.

## Project layout

```
index.html                     the entire application (UI + engines + 3D + charts)
vendor/three.min.js            self-hosted 3D library (no CDN)
vendor/fonts/*.woff2           self-hosted Geist + Space Grotesk
README.md
.github/workflows/deploy.yml   GitHub Pages deploy
.nojekyll
```

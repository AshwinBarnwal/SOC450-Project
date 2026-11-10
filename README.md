# Compounding Advantage

A browser-based life-course inequality game created for SOC450. Players move from their 20s into later life while economic security, health, social connection, wellbeing, household obligations, choices, and random events accumulate.

The game is a static site. It has no server, account system, database, or online multiplayer. Multiplayer is local pass-and-play on one device.

## Play locally

From the repository root:

```powershell
python -m http.server 4173
```

Open `http://localhost:4173`.

## Check the game

Node.js is only used for the test and simulation scripts; it is not required by the deployed game.

```powershell
npm test
npm run test:balance
```

## Run the Monte Carlo simulation

```powershell
npm run simulate
```

This runs 10,000 games for each experimental condition and writes generated results to `output/analysis/`.

## Repository structure

- `index.html`, `styles.css`, `app.js`: deployable game
- `tests/`: smoke and balance checks
- `analysis/monte_carlo.js`: simulation based on the game rules
- `cad_sim.py`, `new_analyses.py`, `make_charts.py`, `Untitled1.ipynb`: supporting analysis from the project
- `render.yaml`: Render static-site configuration

## Deploy on Render

The repository includes a Render Blueprint. It copies only the three game files into a temporary `public/` directory, so notebooks and analysis scripts are not published as website assets.

Use **New > Blueprint** in Render and select this repository. Render reads `render.yaml` and deploys the static site. Alternatively, create a Static Site manually with:

- Build command: `mkdir -p public && cp index.html app.js styles.css public/`
- Publish directory: `public`

Every push to the connected branch can trigger a new deployment.

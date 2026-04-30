#!/bin/bash
# Run this from inside the met0-praisal/ directory after cloning or setting up the repo

git init
git add .
git commit -m "feat: initial scaffold — v0.1.0

- React + Vite client with EVE dark theme
- Express server with ESI name resolution + Fuzzwork Jita 4-4 prices
- Cargo scan / contract / manual paste parser
- Sortable results table with buy/sell breakdown
- Docker Compose + Caddy-ready setup"
git branch -M main
git remote add origin git@github.com:microplasticsenjoyer/met0-praisal.git
git push -u origin main

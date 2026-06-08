#!/usr/bin/env bash
set -e
REPO="${1:-https://github.com/MihailKashintsev/pomidor-ide.git}"
git clone "$REPO"
cd pomidor-ide
npm install
echo "Pomidor IDE downloaded. Run: npm start"

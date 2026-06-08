#!/usr/bin/env bash
set -e
gcc compiler/pomidor.c -o compiler/pomidor
chmod +x compiler/pomidor
echo "compiler/pomidor created"

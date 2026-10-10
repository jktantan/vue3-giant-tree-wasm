#!/bin/bash
# 逐形状子进程执行 benchmark-js-ab.mjs，规避 WASM 线性内存跨场景累积。
# Run benchmark-js-ab.mjs per shape in separate child processes to avoid
# WASM linear-memory accumulation across scenarios (memory never shrinks).
set -euo pipefail

SIZES="${BENCH_SIZES:-100000,1000000}"
ROUNDS="${BENCH_ROUNDS:-5}"

for shape in wide deep random; do
  echo "===== shape=$shape ====="
  BENCH_SHAPES="$shape" BENCH_SIZES="$SIZES" BENCH_ROUNDS="$ROUNDS" \
    node --expose-gc scripts/benchmark-js-ab.mjs
done

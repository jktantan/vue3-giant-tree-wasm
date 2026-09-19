# Phase 5 Migration Evaluation: 2026-09-19

## Decision

Do not start a C/Rust production migration now. Keep AssemblyScript/WASM as the production implementation.

## Evidence

- The complete `pnpm run gate:phase3-4` gate passes: Node tests, release build, 100k capacity, deep-tree samples, 1M compact/legacy benchmark, 4,620-node browser workload, and 100k browser workload.
- Foreground Chrome profiling measured roughly `3ms` of event/compute processing and roughly `28ms` of presentation wait for the representative multi-branch interaction. The current 100k workload reports scroll action P95 around `0.1ms`; render time dominates the wall-clock result.
- The 1M compact path improves leaf checkbox operations (`0.092ms` P95 in recent runs) but does not dominate root/batch selection or visibility rendering. Compact root and batch selection remain slower than legacy because aggregate state and compatibility mirrors are still maintained.
- Browser build profiling shows input bridge, cache assembly, layout bridge, and index refresh in single-digit milliseconds for the controlled workload; none justifies a language migration by itself.

## Scope and Revisit Trigger

Revisit C/Rust only if a fixed-Chrome foreground trace demonstrates that WASM pure computation remains the dominant cost after the current AssemblyScript layout and API work, and a same-layout POC can beat the AssemblyScript baseline on P95, peak memory, binary size, and build/maintenance cost. A migration POC must remain opt-in and must not replace production paths during evaluation.

The remaining full index-native visibility rewrite is an architecture option, not evidence for a language migration. Its current compact rebuild implementation raises 1M expand/collapse P95 to roughly `26/28ms` versus the object incremental baseline around `21/7ms`, so it is not a reason to move languages.

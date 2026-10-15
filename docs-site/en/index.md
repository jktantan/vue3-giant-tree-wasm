---
layout: home

hero:
  name: VueGiantTree
  text: Vue 3 + WebAssembly tree for very large datasets
  tagline: Built for 100K–1M nodes; MPTT + virtual scrolling, core algorithms in WASM
  image:
    src: /logo.svg
    alt: VueGiantTree
  actions:
    - theme: brand
      text: Start with tree building
      link: /en/guide/tree-building
    - theme: alt
      text: Open the playground
      link: /en/playground
    - theme: alt
      text: GitHub
      link: https://github.com/jktantan/vue3-giant-tree-wasm

features:
  - title: WASM-accelerated
    details: Tree building, traversal, search and checking run in WebAssembly (AssemblyScript).
  - title: Virtual scrolling
    details: Only the rows inside the viewport are rendered to the DOM.
  - title: MPTT algorithm
    details: O(1) subtree checks, O(k) viewport slicing, O(subtree + log N) expand/collapse.
  - title: Three selection modes
    details: Checkbox (multi-select), Radio (single-select), click-to-select.
  - title: Fuzzy search
    details: Keyword matching with automatic ancestor chains; the search view keeps its own expansion state.
  - title: Interactive demos
    details: Every page embeds a demo that runs the real WASM and lets you change the configuration.
---

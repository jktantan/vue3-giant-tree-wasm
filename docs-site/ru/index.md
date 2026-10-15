---
layout: home

hero:
  name: VueGiantTree
  text: Дерево на Vue 3 + WebAssembly для очень больших данных
  tagline: Для 100 тыс. — 1 млн узлов; MPTT + виртуальная прокрутка, основные алгоритмы в WASM
  actions:
    - theme: brand
      text: Начать с построения дерева
      link: /ru/guide/tree-building
    - theme: alt
      text: Открыть демо-площадку
      link: /ru/playground
    - theme: alt
      text: GitHub
      link: https://github.com/jktantan/vue3-giant-tree-wasm

features:
  - title: Ускорение через WASM
    details: Построение, обход, поиск и выбор выполняются в WebAssembly (AssemblyScript).
  - title: Виртуальная прокрутка
    details: В DOM рендерятся только строки в области просмотра.
  - title: Алгоритм MPTT
    details: Проверка поддерева за O(1), срез области просмотра за O(k), развёртывание за O(поддерево + log N).
  - title: Три режима выбора
    details: Чекбокс (множественный), радиокнопка (одиночный), выбор по клику.
  - title: Нечёткий поиск
    details: Сопоставление по имени с автоматическим дополнением цепочки предков; у режима поиска своё состояние развёртывания.
  - title: Интерактивные демо
    details: На каждой странице есть демо, которое запускает настоящий WASM и позволяет менять настройки.
---

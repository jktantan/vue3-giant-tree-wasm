# Известные ограничения

Репозиторий проводит обзор каталогов `assembly/` и `lib/` и записывает находки по приоритету в
[`docs/diagnostics.md`](https://github.com/jktantan/vue3-giant-tree-wasm/blob/main/docs/diagnostics.md).
Эта страница — краткое изложение того отчёта: **6 исправлено, 4 оставлено**.

Остальные страницы рассказывают, как пользоваться компонентом; здесь — то, что
**ведёт себя неправильно или недостаточно изящно**.

## Исправлено (6)

| # | Приоритет | Проблема | Как исправлено |
| --- | --- | --- | --- |
| 1 | 🔴 | `appendChild` при добавлении на верхнем уровне сдвигал все узлы на ±2, из-за чего позиция нового узла конфликтовала | Флаг `needsShift`, пропуск перезаписи за O(N) |
| 2 | 🔴 | `checkNodeInTree` мог ошибочно использовать `break` при обходе предков | Цикл сохранён (`break` ломает агрегацию внешних предков), добавлено пояснение |
| 3 | 🟠 | `checkCheckbox` при каждом раунде повторно читал `disabled` | Быстрый путь с переиспользованием `hasDisabledInSubtree` |
| 4 | 🟠 | `_syncAfterStructureMutation` для RADIO / SELECT сканировало всё дерево | `_locateCheckedIndex` и др., O(N) → O(checkedCount) |
| 5 | 🟠 | `refreshAllNodesCache` мог выдать `extendData: undefined` | Запасной вариант плюс предупреждение в консоли для поиска расхождения |
| 6 | 🟡 | `skipValue` молча отказывал при достижении предела глубины | Флаг `_skipValueOverflowed`; `parseOneObject` отбрасывает полузаписанный объект |

## Оставлено (4)

| # | Приоритет | Проблема | Почему можно отложить |
| --- | --- | --- | --- |
| 7 | 🟡 | Читаемость `updateChildState` | Не ошибка времени выполнения; нужна переработка имён |
| 8 | 🟡 | `getParentNodeCheckType` не пропускает отключённых потомков | Используется только на legacy-пути |
| 9 | 🟡 | `guideCells` в `TreeItem.vue` часто вызывает `Array.from` | Критично к производительности, но не блокирует |
| 10 | 🟡 | Отскок троттлинга `flushStructure` в `tree.worker.ts` | Поведение корректно; это оптимизация |

## Связанные документы

- [Отчёт диагностики (репозиторий)](https://github.com/jktantan/vue3-giant-tree-wasm/blob/main/docs/diagnostics.md)
- [План рефакторинга производительности](https://github.com/jktantan/vue3-giant-tree-wasm/blob/main/docs/performance-refactor-plan.md)
- [Архив performance-gate](https://github.com/jktantan/vue3-giant-tree-wasm/blob/main/docs/performance-gate-2026-09-19.md)

## Если поведение расходится с документацией

Ориентируйтесь на **код** и **отчёт диагностики**, и, пожалуйста, откройте
[issue](https://github.com/jktantan/vue3-giant-tree-wasm/issues).

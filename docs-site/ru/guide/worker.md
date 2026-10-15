# Worker и производительность

## О чём эта страница

При включённом `workerMode` алгоритмы дерева выполняются в Web Worker: главный поток только
рендерит, а структурные изменения, поиск и выбор отправляются в Worker командами, и результаты
возвращаются как «снимки видимых строк». Это подходит для двух ситуаций:

- очень большой ввод, где первое построение заняло бы главный поток;
- частые структурные изменения, где повторные правки постоянно запускают пересчёт MPTT.

Плата — один дополнительный round-trip `postMessage` на взаимодействие. На небольших данных режим
главного потока на самом деле быстрее — поэтому `workerMode` по умолчанию выключен.

## Параметры

| prop | Тип | По умолчанию | Описание |
| --- | --- | --- | --- |
| `workerMode` | `boolean` | `false` | Выполнять алгоритмы дерева в Web Worker |
| `chunkedBuild` | `boolean` | `false` | Пакетная запись узлов в WASM; действует только при `outputIdOnly` = `true` и без `filterFn` |
| `buildBatchSize` | `number` | `2000` | Узлов в пакете (когда `chunkedBuild` включён) |

## Метрики

### getBuildMetrics()

Возвращает длительности фаз последнего построения (в миллисекундах): `inputBridgeMs`, `inputYieldMs`,
`finalizeMs`, `layoutBridgeMs`, `cacheAssemblyMs`, `cacheYieldMs`, `layoutReleaseMs`, `cacheIndexMs`,
`cacheRefreshMs`, `shownIndicesMs`, `selectionStatesMs`, `totalMs`.

Когда нужно понять «почему первый кадр медленный», сначала смотрите `totalMs`, затем идите по
списку выше и ищите, какая это фаза.

### getWorkerMetrics()

| Поле | Смысл |
| --- | --- |
| `enabled` | Действительно ли используется Worker |
| `pendingCommands` / `commandsSent` / `snapshotsReceived` | Глубина очереди и накопительные счётчики |
| `lastRoundTripMs` | Round-trip, как его видит главный поток |
| `lastWorkerResponseMs` | Время внутри Worker |
| `lastWorkerSerializeMs` | Время сериализации видимых строк |
| `structuralBatches` / `structuralOperations` / `lastBatchSize` | Как объединялись подряд идущие структурные операции |

**Объединение команд**: подряд идущие структурные изменения не отправляются по одному — они
объединяются в пакет в коротком окне кадра, поэтому `structuralOperations` обычно больше
`structuralBatches`. Именно эту проблему оно и решает.

## Использование

```vue
<VueGiantTree :tree="rows" root="root" worker-mode v-model="selected" />
```

```ts
const metrics = treeRef.value?.getWorkerMetrics()
if (metrics?.enabled) {
  console.log('round trip', metrics.lastRoundTripMs, 'мс', 'пакетов', metrics.structuralBatches)
}
```

Бенчмарки (release WASM, локальный Chromium) — в
[архиве performance-gate](https://github.com/jktantan/vue3-giant-tree-wasm/blob/main/docs/performance-gate-2026-09-19.md).

## На что обратить внимание

Всё ниже измерено; без учёта этих пунктов легко получить «локально быстро, в продакшене медленно».

### Для больших массивов используйте `shallowRef`

Компонент обходит и сериализует весь `tree`. Если хост держит его в глубоко реактивном `ref`, каждое чтение свойства проходит через get trap прокси, который лениво создаёт прокси для каждого вложенного объекта — замер на 100 000 узлов:

| Вариант | `JSON.stringify(100 000 объектов)` |
| --- | --- |
| обычный массив | 17.1ms |
| `ref(...).value` | **277.2ms** |
| `shallowRef(...).value` | 19.6ms |

Внутри компонента вызывается `toRaw()`, поэтому работают оба варианта, но `shallowRef` дешевле — данные дерева всегда заменяются целиком.

```ts
// Рекомендуется
const rows = shallowRef(buildRows())
// Не рекомендуется
const rows = ref(buildRows())
```

### Размер данных определяет, нужен ли Worker

Замерено на release WASM и локальном Chromium:

| Данные | `workerMode: false` | `workerMode: true` |
| --- | --- | --- |
| 10 000 | total **22.8ms**, без блокировки | roundTrip 42.7ms, без блокировки |
| 100 000 | total 242ms, главный поток заблокирован 249ms | roundTrip **53.4ms**, без блокировки |
| 1 000 000 | total 2697ms, главный поток заблокирован 2749ms | roundTrip 584ms |

**До 10 000 узлов основной поток быстрее** (на один round-trip меньше); **от ~100 000 предпочитайте Worker**. Первое включение загружает скрипт воркера и WASM один раз, дальше они переиспользуются.

### Меняйте данные через `tree`, а не через ремаунт с `:key`

```vue
<!-- Рекомендуется: Worker и экземпляр WASM переиспользуются; ~600ms на 1 млн узлов -->
<VueGiantTree :tree="rows" worker-mode />

<!-- Не рекомендуется: каждая пересборка уничтожает и создаёт Worker заново -->
<VueGiantTree :key="reloadKey" :tree="rows" worker-mode />
```

Замена `tree` идёт по бинарному потоковому каналу (UTF-8 + `transfer`), а ремаунт каждый раз заново инициализирует Worker.

### `outputIdOnly` / `filterFn` отключают `chunkedBuild`

`chunkedBuild` действует только при `outputIdOnly === true` и без `filterFn`. Иначе компонент возвращается к JSON-пути для всего дерева, и главный поток занимается целиком. `inputBridgeMs === 0` в `getBuildMetrics()` означает, что пакетный путь не использовался.

## Попробуйте

И переключатель `workerMode`, и оба метода метрик есть на
[полной демо-площадке](/ru/playground): включите «workerMode», затем нажмите
«getBuildMetrics / getWorkerMetrics» — панель покажет `enabled=true` и реальное время round-trip.

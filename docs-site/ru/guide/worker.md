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

## Попробуйте

И переключатель `workerMode`, и оба метода метрик есть на
[полной демо-площадке](/ru/playground): включите «workerMode», затем нажмите
«getBuildMetrics / getWorkerMetrics» — панель покажет `enabled=true` и реальное время round-trip.

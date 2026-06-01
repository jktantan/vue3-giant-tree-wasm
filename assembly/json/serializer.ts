import { escapeString } from './types'

// @ts-ignore: decorator
@inline
function isValidRawJson(value: string): bool {
  const len = value.length
  if (len === 0) return false
  const first = value.charCodeAt(0)
  const last = value.charCodeAt(len - 1)
  if (first === 0x7b) return last === 0x7d // { … }
  if (first === 0x5b) return last === 0x5d // [ … ]
  if (first === 0x22) return last === 0x22 && len >= 2 // "…"
  // true / false / null / number
  if (
    first === 0x74 || // t
    first === 0x66 || // f
    first === 0x6e || // n
    (first >= 0x30 && first <= 0x39) || // 0-9
    first === 0x2d // -
  )
    return true
  return false
}

/**
 * 轻量级 JSON 字符串构建器：通过字符串拼接直接构建 JSON，避免创建中间对象和 AST
 * Lightweight JSON string builder: constructs JSON directly via string concatenation, avoiding intermediate objects and AST
 * Лёгкий построитель строк JSON: создаёт JSON напрямую через конкатенацию строк, избегая промежуточных объектов и AST
 *
 * 性能优势：相比 JSON.stringify 方式，零堆分配（除最终 join 外），适合 WASM 高频调用场景
 * Performance: zero heap allocations (except final join) vs JSON.stringify approach, ideal for high-frequency WASM calls
 * Производительность: ноль выделений в куче (кроме финального join) по сравнению с JSON.stringify, идеально для высокочастотных вызовов WASM
 *
 * 使用方式 / Usage / Использование:
 *   encoder.pushObject(null)
 *   encoder.setString('key', 'value')
 *   encoder.popObject()
 *   const json = encoder.toString()
 *   encoder.reset()  // 重用编码器 / reuse encoder / повторное использование
 */
export class JsonEncoder {
  /** JSON 片段缓冲区 / JSON fragment buffer / Буфер фрагментов JSON */
  private _parts: string[] = new Array<string>()
  /** 逗号插入标记栈：每层 { [ 一个标记，确保首元素前不插入逗号 / Comma insertion flag stack: one per { [ depth, prevents comma before first element / Стек флагов вставки запятых: по одному на уровень вложенности, предотвращает запятую перед первым элементом */
  private _isFirst: bool[] = [true]

  /**
   * 写入键名和逗号分隔符
   * Writes key name and comma separator
   * Записывает имя ключа и разделитель-запятую
   *
   * @param name - 键名（null 表示无键，如数组元素）/ Key name (null for keyless, e.g. array elements) / Имя ключа (null для элементов массива)
   */
  private writeKey(name: string | null): void {
    if (!this._isFirst[this._isFirst.length - 1]) {
      this._parts.push(',')
    } else {
      this._isFirst[this._isFirst.length - 1] = false
    }
    if (name !== null && (name as string).length > 0) {
      this._parts.push('"' + escapeString(name as string) + '":')
    }
  }

  /**
   * 设置字符串字段（自动转义）
   * Sets a string field (auto-escaped)
   * Устанавливает строковое поле (авто-экранирование)
   */
  setString(name: string | null, value: string): void {
    this.writeKey(name)
    this._parts.push('"' + escapeString(value) + '"')
  }

  /**
   * 嵌入原始 JSON 值（不转义、不加引号），用于 extendData 等场景
   * Embeds a raw JSON value (no escaping, no quoting), used for extendData and similar scenarios
   * Встраивает сырое JSON-значение (без экранирования, без кавычек), используется для extendData и подобных сценариев
   */
  setRawJson(name: string | null, value: string): void {
    this.writeKey(name)
    if (isValidRawJson(value)) {
      this._parts.push(value)
    } else {
      this._parts.push('null')
    }
  }

  /**
   * 设置整数字段
   * Sets an integer field
   * Устанавливает целочисленное поле
   */
  setInteger(name: string | null, value: i64): void {
    this.writeKey(name)
    this._parts.push(value.toString())
  }

  /**
   * 设置布尔字段
   * Sets a boolean field
   * Устанавливает булево поле
   */
  setBoolean(name: string | null, value: bool): void {
    this.writeKey(name)
    this._parts.push(value ? 'true' : 'false')
  }

  /**
   * 设置 null 字段
   * Sets a null field
   * Устанавливает поле null
   */
  setNull(name: string | null): void {
    this.writeKey(name)
    this._parts.push('null')
  }

  /**
   * 设置浮点数字段
   * Sets a float field
   * Устанавливает поле с плавающей точкой
   */
  setFloat(name: string | null, value: f64): void {
    this.writeKey(name)
    this._parts.push(value.toString())
  }

  /**
   * 开始一个 JSON 数组
   * Starts a JSON array
   * Начинает JSON-массив
   */
  pushArray(name: string | null): void {
    this.writeKey(name)
    this._parts.push('[')
    this._isFirst.push(true)
  }

  /**
   * 结束当前 JSON 数组
   * Ends the current JSON array
   * Завершает текущий JSON-массив
   */
  popArray(): void {
    this._parts.push(']')
    this._isFirst.pop()
  }

  /**
   * 开始一个 JSON 对象
   * Starts a JSON object
   * Начинает JSON-объект
   */
  pushObject(name: string | null): void {
    this.writeKey(name)
    this._parts.push('{')
    this._isFirst.push(true)
  }

  /**
   * 结束当前 JSON 对象
   * Ends the current JSON object
   * Завершает текущий JSON-объект
   */
  popObject(): void {
    this._parts.push('}')
    this._isFirst.pop()
  }

  /**
   * 获取最终 JSON 字符串
   * Returns the final JSON string
   * Возвращает итоговую строку JSON
   */
  toString(): string {
    return this._parts.join('')
  }

  /**
   * 重置编码器状态，以便重用
   * Resets encoder state for reuse
   * Сбрасывает состояние кодировщика для повторного использования
   */
  reset(): void {
    this._parts = new Array<string>()
    this._isFirst = [true]
  }
}

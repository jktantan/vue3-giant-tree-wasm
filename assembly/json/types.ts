// @ts-ignore: decorator
@lazy const JSON_TRUE: JsonBool = new JsonBool(true)
// @ts-ignore: decorator
@lazy const JSON_FALSE: JsonBool = new JsonBool(false)
// @ts-ignore: decorator
@lazy const JSON_NULL: JsonNull = new JsonNull()

export abstract class JsonValue {
  abstract stringify(): string

  toString(): string {
    return this.stringify()
  }
}

export class JsonStr extends JsonValue {
  constructor(public _val: string) {
    super()
  }

  stringify(): string {
    return '"' + escapeString(this._val) + '"'
  }

  valueOf(): string {
    return this._val
  }
}

export class JsonInt extends JsonValue {
  constructor(public _val: i64) {
    super()
  }

  stringify(): string {
    return this._val.toString()
  }

  valueOf(): i64 {
    return this._val
  }
}

export class JsonFloat extends JsonValue {
  constructor(public _val: f64) {
    super()
  }

  stringify(): string {
    return this._val.toString()
  }

  valueOf(): f64 {
    return this._val
  }
}

export class JsonBool extends JsonValue {
  constructor(public _val: bool) {
    super()
  }

  static from(v: bool): JsonBool {
    return v ? JSON_TRUE : JSON_FALSE
  }

  stringify(): string {
    return this._val ? 'true' : 'false'
  }

  valueOf(): bool {
    return this._val
  }
}

export class JsonNull extends JsonValue {
  static instance(): JsonNull {
    return JSON_NULL
  }

  stringify(): string {
    return 'null'
  }
}

export class JsonArr extends JsonValue {
  _items: Array<JsonValue> = new Array<JsonValue>()

  push(v: JsonValue): void {
    this._items.push(v)
  }

  valueOf(): Array<JsonValue> {
    return this._items
  }

  @inline get length(): i32 {
    return this._items.length
  }

  @inline getItem(i: i32): JsonValue {
    return this._items[i]
  }

  stringify(): string {
    const len = this._items.length
    if (len === 0) return '[]'
    const parts = new Array<string>(len)
    for (let i = 0; i < len; i++) {
      parts[i] = this._items[i].stringify()
    }
    return '[' + parts.join(',') + ']'
  }
}

export class JsonObj extends JsonValue {
  _map: Map<string, JsonValue> = new Map<string, JsonValue>()

  set(key: string, value: JsonValue): void {
    this._map.set(key, value)
  }

  has(key: string): bool {
    return this._map.has(key)
  }

  get(key: string): JsonValue | null {
    if (!this._map.has(key)) return null
    return this._map.get(key)
  }

  get keys(): string[] {
    return this._map.keys()
  }

  getString(key: string): JsonStr | null {
    const v = this.get(key)
    if (v !== null && v instanceof JsonStr) return v as JsonStr
    return null
  }

  getInteger(key: string): JsonInt | null {
    const v = this.get(key)
    if (v !== null && v instanceof JsonInt) return v as JsonInt
    return null
  }

  getFloat(key: string): JsonFloat | null {
    const v = this.get(key)
    if (v !== null && v instanceof JsonFloat) return v as JsonFloat
    return null
  }

  getBool(key: string): JsonBool | null {
    const v = this.get(key)
    if (v !== null && v instanceof JsonBool) return v as JsonBool
    return null
  }

  getArr(key: string): JsonArr | null {
    const v = this.get(key)
    if (v !== null && v instanceof JsonArr) return v as JsonArr
    return null
  }

  getObj(key: string): JsonObj | null {
    const v = this.get(key)
    if (v !== null && v instanceof JsonObj) return v as JsonObj
    return null
  }

  getStringValue(key: string): string | null {
    const s = this.getString(key)
    return s !== null ? s.valueOf() : null
  }

  getIntValue(key: string, defaultVal: i64 = 0): i64 {
    const n = this.getInteger(key)
    return n !== null ? n.valueOf() : defaultVal
  }

  getBoolValue(key: string, defaultVal: bool = false): bool {
    const b = this.getBool(key)
    return b !== null ? b.valueOf() : defaultVal
  }

  stringify(): string {
    const ks = this._map.keys()
    const len = ks.length
    if (len === 0) return '{}'
    const parts = new Array<string>(len)
    for (let i: i32 = 0; i < len; i++) {
      const k = ks[i]
      parts[i] = '"' + escapeString(k) + '":' + this._map.get(k).stringify()
    }
    return '{' + parts.join(',') + '}'
  }
}

export function escapeString(s: string): string {
  let needsEscape = false
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c < 0x20 || c === 0x22 || c === 0x5c) {
      needsEscape = true
      break
    }
  }
  if (!needsEscape) return s

  const parts = new Array<string>()
  let start = 0
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c < 0x20 || c === 0x22 || c === 0x5c) {
      if (i > start) parts.push(s.substring(start, i))
      start = i + 1
      if (c === 0x22) {
        parts.push('\\"')
      } else if (c === 0x5c) {
        parts.push('\\\\')
      } else if (c === 0x08) {
        parts.push('\\b')
      } else if (c === 0x0c) {
        parts.push('\\f')
      } else if (c === 0x0a) {
        parts.push('\\n')
      } else if (c === 0x0d) {
        parts.push('\\r')
      } else if (c === 0x09) {
        parts.push('\\t')
      } else {
        const hex = c.toString(16)
        parts.push('\\u' + '0000'.substring(0, 4 - hex.length) + hex)
      }
    }
  }
  if (start < s.length) parts.push(s.substring(start))
  return parts.join('')
}

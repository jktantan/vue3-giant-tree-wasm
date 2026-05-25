import { escapeString } from './types'

export class JsonEncoder {
  private _parts: string[] = new Array<string>()
  private _isFirst: bool[] = [true]

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

  setString(name: string | null, value: string): void {
    this.writeKey(name)
    this._parts.push('"' + escapeString(value) + '"')
  }

  setInteger(name: string | null, value: i64): void {
    this.writeKey(name)
    this._parts.push(value.toString())
  }

  setBoolean(name: string | null, value: bool): void {
    this.writeKey(name)
    this._parts.push(value ? 'true' : 'false')
  }

  setNull(name: string | null): void {
    this.writeKey(name)
    this._parts.push('null')
  }

  setFloat(name: string | null, value: f64): void {
    this.writeKey(name)
    this._parts.push(value.toString())
  }

  pushArray(name: string | null): void {
    this.writeKey(name)
    this._parts.push('[')
    this._isFirst.push(true)
  }

  popArray(): void {
    this._parts.push(']')
    this._isFirst.pop()
  }

  pushObject(name: string | null): void {
    this.writeKey(name)
    this._parts.push('{')
    this._isFirst.push(true)
  }

  popObject(): void {
    this._parts.push('}')
    this._isFirst.pop()
  }

  toString(): string {
    return this._parts.join('')
  }

  reset(): void {
    this._parts = new Array<string>()
    this._isFirst = [true]
  }
}

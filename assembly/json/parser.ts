import {
  JsonValue,
  JsonStr,
  JsonInt,
  JsonFloat,
  JsonBool,
  JsonNull,
  JsonArr,
  JsonObj,
} from './types'

// @ts-ignore: decorator
@lazy const CHAR_0: i32 = 48
// @ts-ignore: decorator
@lazy const CHAR_9: i32 = 57
// @ts-ignore: decorator
@lazy const CHAR_MINUS: i32 = 45
// @ts-ignore: decorator
@lazy const CHAR_PLUS: i32 = 43
// @ts-ignore: decorator
@lazy const CHAR_DOT: i32 = 46
// @ts-ignore: decorator
@lazy const CHAR_E_UPPER: i32 = 69
// @ts-ignore: decorator
@lazy const CHAR_E_LOWER: i32 = 101
// @ts-ignore: decorator
@lazy const CHAR_QUOTE: i32 = 34
// @ts-ignore: decorator
@lazy const CHAR_BACKSLASH: i32 = 92
// @ts-ignore: decorator
@lazy const CHAR_LBRACE: i32 = 123
// @ts-ignore: decorator
@lazy const CHAR_RBRACE: i32 = 125
// @ts-ignore: decorator
@lazy const CHAR_LBRACKET: i32 = 91
// @ts-ignore: decorator
@lazy const CHAR_RBRACKET: i32 = 93
// @ts-ignore: decorator
@lazy const CHAR_COMMA: i32 = 44
// @ts-ignore: decorator
@lazy const CHAR_COLON: i32 = 58
// @ts-ignore: decorator
@lazy const CHAR_t: i32 = 116
// @ts-ignore: decorator
@lazy const CHAR_f: i32 = 102
// @ts-ignore: decorator
@lazy const CHAR_n: i32 = 110

let _src: string = ''
let _pos: i32 = 0
let _len: i32 = 0

export function jsonParse(src: string): JsonValue {
  _src = src
  _pos = 0
  _len = src.length
  skipWs()
  const result = parseValue()
  _src = ''
  return result
}

// @ts-ignore: decorator
@inline
function ch(): i32 {
  return _pos < _len ? _src.charCodeAt(_pos) : -1
}

// @ts-ignore: decorator
@inline
function advance(): void {
  _pos++
}

// @ts-ignore: decorator
@inline
function skipWs(): void {
  while (_pos < _len) {
    const c = _src.charCodeAt(_pos)
    if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) {
      _pos++
    } else {
      break
    }
  }
}

function parseValue(): JsonValue {
  const c = ch()
  if (c === CHAR_QUOTE) return parseString()
  if (c === CHAR_LBRACE) return parseObject()
  if (c === CHAR_LBRACKET) return parseArray()
  if (c === CHAR_t) return parseTrue()
  if (c === CHAR_f) return parseFalse()
  if (c === CHAR_n) return parseNull()
  if (c === CHAR_MINUS || (c >= CHAR_0 && c <= CHAR_9)) return parseNumber()
  abort('Unexpected character at position ' + _pos.toString())
  return JsonNull.instance()
}

function parseString(): JsonValue {
  return new JsonStr(readString())
}

function readString(): string {
  assert(ch() === CHAR_QUOTE, 'Expected "')
  advance()
  const start = _pos
  let hasEscape = false

  while (_pos < _len) {
    const c = _src.charCodeAt(_pos)
    if (c === CHAR_QUOTE) {
      if (!hasEscape) {
        const s = _src.substring(start, _pos)
        advance()
        return s
      }
      break
    }
    if (c === CHAR_BACKSLASH) {
      hasEscape = true
      _pos += 2
    } else {
      _pos++
    }
  }

  if (!hasEscape) {
    const s = _src.substring(start, _pos)
    advance()
    return s
  }

  _pos = start
  const parts = new Array<string>()
  let segStart = _pos
  while (_pos < _len) {
    const c = _src.charCodeAt(_pos)
    if (c === CHAR_QUOTE) {
      if (_pos > segStart) parts.push(_src.substring(segStart, _pos))
      advance()
      return parts.length === 1 ? parts[0] : parts.join('')
    }
    if (c === CHAR_BACKSLASH) {
      if (_pos > segStart) parts.push(_src.substring(segStart, _pos))
      advance()
      parts.push(readEscapedChar())
      segStart = _pos
    } else {
      _pos++
    }
  }
  abort('Unterminated string')
  return ''
}

function readEscapedChar(): string {
  const c = ch()
  advance()
  if (c === CHAR_QUOTE) return '"'
  if (c === CHAR_BACKSLASH) return '\\'
  if (c === 0x2f) return '/'
  if (c === 0x62) return '\b'
  if (c === 0x6e) return '\n'
  if (c === 0x72) return '\r'
  if (c === 0x74) return '\t'
  if (c === 0x66) return '\f'
  if (c === 0x75) {
    let code: i32 = 0
    for (let i = 0; i < 4; i++) {
      code = code * 16 + hexDigit(ch())
      advance()
    }
    return String.fromCodePoint(code)
  }
  abort('Invalid escape character')
  return ''
}

// @ts-ignore: decorator
@inline
function hexDigit(c: i32): i32 {
  if (c >= CHAR_0 && c <= CHAR_9) return c - CHAR_0
  if (c >= 65 && c <= 70) return c - 55
  if (c >= 97 && c <= 102) return c - 87
  abort('Invalid hex digit')
  return 0
}

function parseNumber(): JsonValue {
  const start = _pos
  let isFloat = false

  if (ch() === CHAR_MINUS) advance()

  while (_pos < _len) {
    const c = _src.charCodeAt(_pos)
    if (c >= CHAR_0 && c <= CHAR_9) {
      _pos++
    } else {
      break
    }
  }

  if (_pos < _len && _src.charCodeAt(_pos) === CHAR_DOT) {
    isFloat = true
    _pos++
    while (_pos < _len) {
      const c = _src.charCodeAt(_pos)
      if (c >= CHAR_0 && c <= CHAR_9) {
        _pos++
      } else {
        break
      }
    }
  }

  if (_pos < _len) {
    const c = _src.charCodeAt(_pos)
    if (c === CHAR_E_UPPER || c === CHAR_E_LOWER) {
      isFloat = true
      _pos++
      if (_pos < _len) {
        const s = _src.charCodeAt(_pos)
        if (s === CHAR_PLUS || s === CHAR_MINUS) _pos++
      }
      while (_pos < _len) {
        const c2 = _src.charCodeAt(_pos)
        if (c2 >= CHAR_0 && c2 <= CHAR_9) {
          _pos++
        } else {
          break
        }
      }
    }
  }

  const numStr = _src.substring(start, _pos)

  if (isFloat) {
    return new JsonFloat(parseFloat(numStr))
  }

  if (numStr === '-0') {
    return new JsonFloat(-0.0)
  }

  return new JsonInt(I64.parseInt(numStr))
}

function parseObject(): JsonValue {
  assert(ch() === CHAR_LBRACE, 'Expected {')
  advance()
  skipWs()
  const obj = new JsonObj()
  if (ch() === CHAR_RBRACE) {
    advance()
    return obj
  }
  while (true) {
    skipWs()
    assert(ch() === CHAR_QUOTE, 'Expected key string')
    const key = readString()
    skipWs()
    assert(ch() === CHAR_COLON, 'Expected :')
    advance()
    skipWs()
    const val = parseValue()
    obj.set(key, val)
    skipWs()
    const c = ch()
    if (c === CHAR_COMMA) {
      advance()
    } else if (c === CHAR_RBRACE) {
      advance()
      return obj
    } else {
      abort('Expected , or } in object')
    }
  }
  return obj
}

function parseArray(): JsonValue {
  assert(ch() === CHAR_LBRACKET, 'Expected [')
  advance()
  skipWs()
  const arr = new JsonArr()
  if (ch() === CHAR_RBRACKET) {
    advance()
    return arr
  }
  while (true) {
    skipWs()
    arr.push(parseValue())
    skipWs()
    const c = ch()
    if (c === CHAR_COMMA) {
      advance()
    } else if (c === CHAR_RBRACKET) {
      advance()
      return arr
    } else {
      abort('Expected , or ] in array')
    }
  }
  return arr
}

function parseTrue(): JsonValue {
  assert(
    _src.charCodeAt(_pos) === 116 &&
      _src.charCodeAt(_pos + 1) === 114 &&
      _src.charCodeAt(_pos + 2) === 117 &&
      _src.charCodeAt(_pos + 3) === 101,
    'Expected true'
  )
  _pos += 4
  return JsonBool.from(true)
}

function parseFalse(): JsonValue {
  assert(
    _src.charCodeAt(_pos) === 102 &&
      _src.charCodeAt(_pos + 1) === 97 &&
      _src.charCodeAt(_pos + 2) === 108 &&
      _src.charCodeAt(_pos + 3) === 115 &&
      _src.charCodeAt(_pos + 4) === 101,
    'Expected false'
  )
  _pos += 5
  return JsonBool.from(false)
}

function parseNull(): JsonValue {
  assert(
    _src.charCodeAt(_pos) === 110 &&
      _src.charCodeAt(_pos + 1) === 117 &&
      _src.charCodeAt(_pos + 2) === 108 &&
      _src.charCodeAt(_pos + 3) === 108,
    'Expected null'
  )
  _pos += 4
  return JsonNull.instance()
}

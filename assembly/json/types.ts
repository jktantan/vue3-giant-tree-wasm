/**
 * JSON 字符串转义：将控制字符、引号和反斜杠转为 JSON 转义序列
 * JSON string escaping: converts control characters, quotes, and backslashes to JSON escape sequences
 * Экранирование строки JSON: преобразует управляющие символы, кавычки и обратные слэши в escape-последовательности JSON
 *
 * 处理: \b \f \n \r \t \\ \" 和 \uXXXX（其他控制字符）
 * 仅在遇到需转义字符时才分配新字符串，否则直接返回原字符串（零拷贝快速路径）
 *
 * Handles: \b \f \n \r \t \\ \" and \uXXXX (other control chars)
 * Only allocates when an escapable char is found; returns original string otherwise (zero-copy fast path)
 *
 * Обрабатывает: \b \f \n \r \t \\ \" и \uXXXX (прочие управляющие символы)
 * Выделяет новую строку только при обнаружении экранируемого символа; иначе возвращает исходную (быстрый путь без копирования)
 */
// @ts-ignore: decorator
@inline
function escapeChar(c: i32): string {
  if (c === 0x22) return '\\"'
  if (c === 0x5c) return '\\\\'
  if (c === 0x08) return '\\b'
  if (c === 0x0c) return '\\f'
  if (c === 0x0a) return '\\n'
  if (c === 0x0d) return '\\r'
  if (c === 0x09) return '\\t'
  const hex = c.toString(16)
  return '\\u' + '0000'.substring(0, 4 - hex.length) + hex
}

export function escapeString(s: string): string {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c < 0x20 || c === 0x22 || c === 0x5c) {
      let result: string = i > 0 ? s.substring(0, i) : ''
      result += escapeChar(c)
      let start = i + 1
      i++
      while (i < s.length) {
        const c2 = s.charCodeAt(i)
        if (c2 < 0x20 || c2 === 0x22 || c2 === 0x5c) {
          if (i > start) result += s.substring(start, i)
          start = i + 1
          result += escapeChar(c2)
        }
        i++
      }
      if (start < s.length) result += s.substring(start)
      return result
    }
  }
  return s
}

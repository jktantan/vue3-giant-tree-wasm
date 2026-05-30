export function escapeString(s: string): string {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c < 0x20 || c === 0x22 || c === 0x5c) {
      const parts = new Array<string>()
      if (i > 0) parts.push(s.substring(0, i))
      let start = i + 1
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
      i++
      while (i < s.length) {
        const c2 = s.charCodeAt(i)
        if (c2 < 0x20 || c2 === 0x22 || c2 === 0x5c) {
          if (i > start) parts.push(s.substring(start, i))
          start = i + 1
          if (c2 === 0x22) {
            parts.push('\\"')
          } else if (c2 === 0x5c) {
            parts.push('\\\\')
          } else if (c2 === 0x08) {
            parts.push('\\b')
          } else if (c2 === 0x0c) {
            parts.push('\\f')
          } else if (c2 === 0x0a) {
            parts.push('\\n')
          } else if (c2 === 0x0d) {
            parts.push('\\r')
          } else if (c2 === 0x09) {
            parts.push('\\t')
          } else {
            const hex = c2.toString(16)
            parts.push('\\u' + '0000'.substring(0, 4 - hex.length) + hex)
          }
        }
        i++
      }
      if (start < s.length) parts.push(s.substring(start))
      return parts.join('')
    }
  }
  return s
}

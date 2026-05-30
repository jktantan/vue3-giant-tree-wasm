import { MpttTree, NeighborTree, TreeFieldKeys } from './models'

// ─── Inline helpers ───

// @ts-ignore: decorator
@inline
function skipWs(src: string, pos: i32, len: i32): i32 {
  while (pos < len) {
    const c = src.charCodeAt(pos)
    if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) pos++
    else break
  }
  return pos
}

// Read a JSON string value, returns the unescaped content. pos must be at opening "
// @ts-ignore: decorator
@inline
function readStringContent(src: string, pos: i32, len: i32): string {
  pos++ // skip opening "
  const start = pos
  while (pos < len) {
    const c = src.charCodeAt(pos)
    if (c === 0x22) {
      // quote
      return src.substring(start, pos)
    }
    if (c === 0x5c) pos++ // backslash: skip next char
    pos++
  }
  return ''
}

// Advance pos past a string value (including quotes). pos must be at opening "
// @ts-ignore: decorator
@inline
function skipString(src: string, pos: i32, len: i32): i32 {
  pos++ // skip opening "
  while (pos < len) {
    const c = src.charCodeAt(pos)
    if (c === 0x22) return pos + 1
    if (c === 0x5c) pos++
    pos++
  }
  return pos
}

// Advance pos past a JSON value of any type
function skipValue(src: string, pos: i32, len: i32): i32 {
  pos = skipWs(src, pos, len)
  if (pos >= len) return pos
  const c = src.charCodeAt(pos)
  if (c === 0x22) return skipString(src, pos, len)
  if (c === 0x7b) return skipObject(src, pos, len) // '{'
  if (c === 0x5b) return skipArray(src, pos, len) // '['
  // number / true / false / null
  while (pos < len) {
    const ch = src.charCodeAt(pos)
    if (
      ch === 0x2c ||
      ch === 0x7d ||
      ch === 0x5d || // , } ]
      ch === 0x20 ||
      ch === 0x09 ||
      ch === 0x0a ||
      ch === 0x0d
    )
      break
    pos++
  }
  return pos
}

function skipObject(src: string, pos: i32, len: i32): i32 {
  pos++ // skip '{'
  while (pos < len) {
    pos = skipWs(src, pos, len)
    if (pos >= len) break
    if (src.charCodeAt(pos) === 0x7d) return pos + 1 // '}'
    pos = skipString(src, pos, len) // key
    pos = skipWs(src, pos, len)
    if (src.charCodeAt(pos) === 0x3a) pos++ // ':'
    pos = skipWs(src, pos, len)
    pos = skipValue(src, pos, len) // value
    pos = skipWs(src, pos, len)
    if (src.charCodeAt(pos) === 0x7d) return pos + 1 // '}'
    if (src.charCodeAt(pos) === 0x2c) pos++ // ','
  }
  return pos
}

function skipArray(src: string, pos: i32, len: i32): i32 {
  pos++ // skip '['
  while (pos < len) {
    pos = skipWs(src, pos, len)
    if (pos >= len) break
    if (src.charCodeAt(pos) === 0x5d) return pos + 1 // ']'
    pos = skipValue(src, pos, len)
    pos = skipWs(src, pos, len)
    if (src.charCodeAt(pos) === 0x5d) return pos + 1 // ']'
    if (src.charCodeAt(pos) === 0x2c) pos++ // ','
  }
  return pos
}

// ─── Core parser: JSON string → NeighborTree[] with dynamic field keys ───

function parseOneObject(
  src: string,
  pos: i32,
  len: i32,
  fk: TreeFieldKeys,
  result: NeighborTree[]
): i32 {
  const objStart: i32 = pos
  pos++ // skip '{'
  const nt: NeighborTree = new NeighborTree()

  while (pos < len) {
    pos = skipWs(src, pos, len)
    const c = src.charCodeAt(pos)
    if (c === 0x7d) {
      // '}'
      pos++
      break
    }
    if (c === 0x2c) {
      pos++
      continue
    } // ',' skip trailing commas

    // Read key
    const key: string = readStringContent(src, pos, len)
    pos = skipString(src, pos, len) // advance past key
    pos = skipWs(src, pos, len)
    if (src.charCodeAt(pos) === 0x3a) pos++ // ':'
    pos = skipWs(src, pos, len)

    // Match key and read value
    if (key === fk.idField) {
      nt.id = readStringContent(src, pos, len)
    } else if (key === fk.nameField) {
      nt.name = readStringContent(src, pos, len)
    } else if (key === fk.parentIdField) {
      nt.parentId = readStringContent(src, pos, len)
    } else if (key === 'disabled') {
      // check for "true" keyword
      pos = skipWs(src, pos, len)
      if (pos + 4 <= len) {
        nt.disabled = src.charCodeAt(pos) === 0x74 // 't'
      }
    }
    pos = skipValue(src, pos, len)
  }

  // extendData: raw JSON substring of the original object
  nt.extendData = src.substring(objStart, pos)
  result.push(nt)
  return pos
}

export function parseNeighborArray(
  src: string,
  fk: TreeFieldKeys
): NeighborTree[] {
  const result: NeighborTree[] = []
  const len: i32 = src.length
  let pos: i32 = 0

  pos = skipWs(src, pos, len)
  if (pos < len && src.charCodeAt(pos) === 0x5b) pos++ // '['

  while (pos < len) {
    pos = skipWs(src, pos, len)
    if (pos >= len) break
    const c = src.charCodeAt(pos)
    if (c === 0x5d) break // ']'
    if (c === 0x2c) {
      pos++
      continue
    } // ','
    if (c === 0x7b) {
      pos = parseOneObject(src, pos, len, fk, result)
    } else {
      pos++
    }
  }
  return result
}

// ─── Public API ───

export function hasMpttFields(src: string, fk: TreeFieldKeys): bool {
  return (
    src.indexOf(fk.leftNodeField) !== -1 &&
    src.indexOf(fk.rightNodeField) !== -1
  )
}

export function parseTreeFromJson(
  jsonStr: string,
  fieldKeys: TreeFieldKeys
): NeighborTree[] {
  return parseNeighborArray(jsonStr, fieldKeys)
}

export function parseNeighborTreeFromJson(jsonStr: string): NeighborTree[] {
  return parseNeighborArray(jsonStr, new TreeFieldKeys())
}

export function convertNeighborToMptt(
  neighborTrees: NeighborTree[],
  root: string,
  fullTree: MpttTree[]
): i32 {
  const treeMap: Map<string, NeighborTree[]> = new Map()
  for (let i = 0; i < neighborTrees.length; i++) {
    const nt: NeighborTree = neighborTrees[i]
    if (!treeMap.has(nt.parentId)) {
      treeMap.set(nt.parentId, [])
    }
    treeMap.get(nt.parentId).push(nt)
  }

  const shownCountRef: i32[] = [0]
  _recursiveAssembly(treeMap, root, 0, 0, root, fullTree, shownCountRef)
  treeMap.clear()
  return shownCountRef[0]
}

function _recursiveAssembly(
  treeMap: Map<string, NeighborTree[]>,
  parentId: string,
  lNode: i32,
  deep: i32,
  root: string,
  fullTree: MpttTree[],
  shownCountRef: i32[],
  parentDisabled: bool = false
): i32 {
  if (treeMap.has(parentId)) {
    const children = treeMap.get(parentId)
    const currentDeep: i32 = deep
    for (let i = 0; i < children.length; i++) {
      const nt: NeighborTree = children[i]
      const mptt: MpttTree = new MpttTree()
      mptt.id = nt.id
      mptt.name = nt.name
      mptt.parentId = nt.parentId
      mptt.disabled = nt.disabled || parentDisabled
      mptt.extendData = nt.extendData
      mptt.leftNode = lNode
      mptt.deep = currentDeep

      fullTree.push(mptt)

      const rightNode: i32 = _recursiveAssembly(
        treeMap,
        mptt.id,
        lNode + 1,
        currentDeep + 1,
        root,
        fullTree,
        shownCountRef,
        mptt.disabled
      )

      mptt.rightNode = rightNode

      if (mptt.parentId === root) {
        mptt.shown = true
        shownCountRef[0]++
      }
      lNode = rightNode + 1
    }
  }
  return lNode
}

export function parseMpttTreeFromJson(
  tree: string,
  root: string,
  fullTree: MpttTree[],
  fieldKeys: TreeFieldKeys | null = null
): i32 {
  const fk = fieldKeys !== null ? fieldKeys : new TreeFieldKeys()
  const neighborTrees = parseNeighborArray(tree, fk)
  return convertNeighborToMptt(neighborTrees, root, fullTree)
}

export function buildIdIndex(fullTree: MpttTree[]): Map<string, i32> {
  const idToIndex: Map<string, i32> = new Map()
  for (let i: i32 = 0; i < fullTree.length; i++) {
    idToIndex.set(fullTree[i].id, i)
  }
  return idToIndex
}

export function sortByLeftNode(tree: MpttTree[]): void {
  tree.sort((a: MpttTree, b: MpttTree): i32 => {
    return a.leftNode - b.leftNode
  })
}

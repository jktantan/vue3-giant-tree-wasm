import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const releasePath = join(__dirname, '..', 'build', 'release.js')

const mod = await import(pathToFileURL(releasePath).href)

export const {
  memory,
  newTree,
  setNeighborTree,
  setMpttTree,
  getSize,
  getShownNodes,
  getCheckedNodes,
  switchDisplayTree,
  clear,
  popNeighbor,
  pushNeighborNode,
  popMptt,
  pushMpttNode,
  setBoundary,
  fuzzyTree,
  checkNode,
  clearCheckedNodes,
  setCheckedNode,
  setCheckedNodes,
  getShownHeight,
  collapseTree,
  CheckType,
  SelectType,
  DisplayType,
} = mod

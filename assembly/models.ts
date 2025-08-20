export class NeighborTree {
  // x and y directional component of the vector
  id: string = ''
  name: string = ''
  parentId: string = ''
  extendData: string = ''
}

export class MpttTree extends NeighborTree {
  leftNode: i32 = 0
  rightNode: i32 = 0
  deep: i32 = 0
  top: f32 = 0
  bottom: f32 = 0
  checked: CheckType = CheckType.UNCHECKED
  selected: CheckType = CheckType.UNCHECKED
  collapsed: boolean = true
  shown: boolean = false
}
export enum CheckType {
  UNCHECKED,
  HALF_CHECKED,
  CHECKED,
}

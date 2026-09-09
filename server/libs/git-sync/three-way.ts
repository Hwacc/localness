export type ThreeWayDecision = 'apply-theirs' | 'keep-ours' | 'conflict' | 'align'

export function decideThreeWay(
  base: string | null | undefined,
  ours: string | null | undefined,
  theirs: string | null | undefined
): ThreeWayDecision {
  const b = base ?? ''
  const o = ours ?? ''
  const t = theirs ?? ''
  if (o === t) return 'align'
  if (o === b && t !== b) return 'apply-theirs'
  if (t === b && o !== b) return 'keep-ours'
  return 'conflict'
}

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const dir = join(process.cwd(), 'shared', 'contract')

describe('shared/contract boundary', () => {
  it('imports only zod and sibling files', () => {
    const bad: string[] = []
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.ts'))) {
      const src = readFileSync(join(dir, f), 'utf8')
      for (const m of src.matchAll(/from\s+'([^']+)'/g)) {
        const spec = m[1]!
        if (spec !== 'zod' && spec !== 'zod/v4' && !spec.startsWith('./')) {
          bad.push(`${f}: ${spec}`)
        }
      }
    }
    expect(bad).toEqual([])
  })
})

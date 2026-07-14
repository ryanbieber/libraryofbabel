import { describe, expect, it } from 'vitest'
import { roomVisualProfile } from './roomVisuals'

describe('room visual profiles', () => {
  it('gives archives, galleries, and stacks distinct visual identities', () => {
    const archive = roomVisualProfile('archive')
    const gallery = roomVisualProfile('gallery')
    const stack = roomVisualProfile('stack')

    expect(archive.shelf.verticalStep).toBeLessThan(stack.shelf.verticalStep)
    expect(gallery.shelf.bookWidthScale).toBeLessThan(stack.shelf.bookWidthScale)
    expect(archive.table.position).not.toEqual(stack.table.position)
    expect(gallery.table.accessory).toBe('display-case')
    expect(new Set([archive.lighting.accentColor, gallery.lighting.accentColor, stack.lighting.accentColor]).size).toBe(3)
    expect(archive.dust.count).toBeGreaterThan(stack.dust.count)
    expect(gallery.dust.count).toBeLessThan(stack.dust.count)
  })
})

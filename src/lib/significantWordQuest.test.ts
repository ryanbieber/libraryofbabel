import { describe, expect, it } from 'vitest'
import { resolveSignificantWordQuestSubmission, type WordQuestFormValues } from './significantWordQuest'
import { findWord } from './wordFinder'

const baseSubmission: WordQuestFormValues = {
  floor: '0',
  gallery: '0',
  wall: 'A',
  shelf: '1',
  volume: '1',
  page: '1',
}

describe('significant word quest submission', () => {
  it('requires accepting the quest before coordinates can be tested', () => {
    const result = resolveSignificantWordQuestSubmission(baseSubmission, 'not-started')
    expect(result.feedback.text).toBe('Accept the monk quest before testing coordinates.')
    expect(result.nextStatus).toBeUndefined()
  })

  it('validates unbounded coordinates and the dual-format wall address', () => {
    expect(resolveSignificantWordQuestSubmission({ ...baseSubmission, floor: '01' }, 'accepted').feedback.text).toBe('Floor must be a canonical signed integer.')
    expect(resolveSignificantWordQuestSubmission({ ...baseSubmission, gallery: '1e9' }, 'accepted').feedback.text).toBe('Gallery must be a canonical signed integer.')
    expect(resolveSignificantWordQuestSubmission({ ...baseSubmission, floor: '999999999999999999999', gallery: '-888888888888888888888' }, 'accepted').feedback.text).not.toMatch(/canonical signed integer/)
    expect(resolveSignificantWordQuestSubmission({ ...baseSubmission, wall: 'ceiling' }, 'accepted').feedback.text).toBe('Wall must be I-IV, A-D, or 1-4.')
    expect(resolveSignificantWordQuestSubmission({ ...baseSubmission, wall: 'I' }, 'accepted').feedback.text).not.toMatch(/Wall must/)
  })

  it('rejects accepted coordinates when the page does not contain the target word', () => {
    const result = resolveSignificantWordQuestSubmission(baseSubmission, 'accepted')
    expect(result.feedback.tone).toBe('error')
    expect(result.feedback.text).toContain('A confident heretic is still a heretic.')
  })

  it('accepts the canonical page located for babel', async () => {
    const finding = await findWord('babel')
    if (!finding.valid) throw new Error(finding.message)
    const { floor, gallery, wall, shelf, book, page } = finding.finding.address
    const result = resolveSignificantWordQuestSubmission({
      floor: String(floor),
      gallery: String(gallery),
      wall,
      shelf: String(shelf + 1),
      volume: String(book + 1),
      page: String(page),
    }, 'accepted')

    expect(result.feedback.tone).toBe('success')
    expect(result.nextStatus).toBe('ready-to-complete')
  })
})

import { describe, expect, it } from 'vitest'
import { resolveSignificantWordQuestSubmission, type WordQuestFormValues } from './significantWordQuest'

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

  it('validates the floor, gallery, and dual-format wall address', () => {
    expect(resolveSignificantWordQuestSubmission({ ...baseSubmission, floor: '2' }, 'accepted').feedback.text).toBe('Floor must be -1, 0, or 1.')
    expect(resolveSignificantWordQuestSubmission({ ...baseSubmission, gallery: '3' }, 'accepted').feedback.text).toBe('Gallery must be between -2 and 2.')
    expect(resolveSignificantWordQuestSubmission({ ...baseSubmission, wall: 'ceiling' }, 'accepted').feedback.text).toBe('Wall must be I-IV, A-D, or 1-4.')
    expect(resolveSignificantWordQuestSubmission({ ...baseSubmission, wall: 'I' }, 'accepted').feedback.text).not.toMatch(/Wall must/)
  })

  it('rejects accepted coordinates when the page does not contain the target word', () => {
    const result = resolveSignificantWordQuestSubmission(baseSubmission, 'accepted')
    expect(result.feedback.tone).toBe('error')
    expect(result.feedback.text).toContain('A confident heretic is still a heretic.')
  })
})

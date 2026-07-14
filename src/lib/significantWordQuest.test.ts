import { describe, expect, it } from 'vitest'
import { resolveSignificantWordQuestSubmission, type WordQuestFormValues } from './significantWordQuest'

const baseSubmission: WordQuestFormValues = {
  room: '0,0',
  wall: 'north',
  shelf: '1',
  volume: '1',
  page: '1',
}

describe('significant word quest submission', () => {
  it('requires accepting the quest before coordinates can be tested', () => {
    const result = resolveSignificantWordQuestSubmission(baseSubmission, 'not-started')

    expect(result.feedback).toEqual({
      tone: 'error',
      text: 'Accept the monk quest before testing coordinates.',
    })
    expect(result.nextStatus).toBeUndefined()
  })

  it('validates wall names before generating a page', () => {
    const result = resolveSignificantWordQuestSubmission({ ...baseSubmission, wall: 'ceiling' }, 'accepted')

    expect(result.feedback).toEqual({
      tone: 'error',
      text: 'Choose a wall: north, east, south, west, or 1-4.',
    })
  })

  it('rejects accepted coordinates when the page does not contain the target word', () => {
    const result = resolveSignificantWordQuestSubmission(baseSubmission, 'accepted')

    expect(result.feedback.tone).toBe('error')
    expect(result.feedback.text).toContain('A confident heretic is still a heretic.')
    expect(result.nextStatus).toBeUndefined()
  })
})

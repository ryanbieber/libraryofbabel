import { X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import type { LibraryNpc } from '../lib/npcs'
import { QUEST_TARGET_WORD, targetWordOdds } from '../lib/quest'
import type { WordQuestFeedback, WordQuestFormValues, WordQuestStatus } from '../lib/significantWordQuest'

const significantWordOdds = targetWordOdds(QUEST_TARGET_WORD)

export function NpcDialoguePanel({
  npc,
  questStatus,
  questFeedback,
  onClose,
  onAcceptSignificantWordQuest,
  onSubmitSignificantWordQuest,
  onCompleteSignificantWordQuest,
}: {
  npc: LibraryNpc
  questStatus: WordQuestStatus
  questFeedback: WordQuestFeedback | null
  onClose: () => void
  onAcceptSignificantWordQuest: () => void
  onSubmitSignificantWordQuest: (values: WordQuestFormValues) => void
  onCompleteSignificantWordQuest: () => void
}) {
  const [formValues, setFormValues] = useState<WordQuestFormValues>({
    room: '',
    wall: '',
    shelf: '',
    volume: '',
    page: '',
  })
  const isSignificantWordQuest = npc.quest === 'significant-word'

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmitSignificantWordQuest(formValues)
  }

  return (
    <section className="npc-dialogue" aria-label="Monk dialogue">
      <div className="npc-dialogue-panel">
        <button type="button" className="close-reader" aria-label="Close monk dialogue" onClick={onClose}>
          <X size={22} aria-hidden="true" />
        </button>
        <header className="npc-dialogue-header">
          <p className="splash-kicker">{npcQuestKicker(npc.quest)}</p>
          <h2>{npc.name}</h2>
        </header>
        <div className="npc-dialogue-lines">
          {npc.dialogue.map((line) => (
            <p key={line}>{line}</p>
          ))}
          {isSignificantWordQuest ? (
            <>
              <p>
                A specific five-letter word has about a {formatPercent(significantWordOdds.bookChance)} chance in a
                book, roughly 1 in {formatWhole(significantWordOdds.oneInBooks)} books. A single page is roughly 1 in{' '}
                {formatWhole(significantWordOdds.oneInPages)}.
              </p>
              {questStatus === 'ready-to-complete' ? (
                <p>The page has been proven. The keeper waits for you to finish the work.</p>
              ) : null}
              {questStatus === 'completed' ? (
                <p>The coordinate is accepted. The stacks fall quiet around the finished quest.</p>
              ) : null}
            </>
          ) : null}
        </div>
        {isSignificantWordQuest && questStatus === 'not-started' ? (
          <div className="quest-offer">
            <button type="button" onClick={onAcceptSignificantWordQuest}>
              accept quest
            </button>
          </div>
        ) : null}
        {isSignificantWordQuest && questStatus === 'ready-to-complete' ? (
          <div className="quest-complete-card" aria-label="Quest ready to complete">
            <div>
              <span>Quest Complete</span>
              <strong>Find "{QUEST_TARGET_WORD}"</strong>
            </div>
            <button type="button" onClick={onCompleteSignificantWordQuest}>
              complete quest
            </button>
          </div>
        ) : null}
        {isSignificantWordQuest && questStatus === 'accepted' ? (
          <div className="quest-ledger" aria-label="Quest address book">
            <div className="quest-ledger-title">
              <span>Quest Ledger</span>
              <strong>Find "{QUEST_TARGET_WORD}"</strong>
            </div>
            <form className="quest-form" aria-label="Submit book coordinates" onSubmit={handleSubmit}>
              <label>
                room
                <input
                  value={formValues.room}
                  aria-label="Quest room"
                  placeholder="0,0"
                  onChange={(event) => setFormValues((current) => ({ ...current, room: event.target.value }))}
                />
              </label>
              <label>
                wall
                <input
                  value={formValues.wall}
                  aria-label="Quest wall"
                  placeholder="north"
                  onChange={(event) => setFormValues((current) => ({ ...current, wall: event.target.value }))}
                />
              </label>
              <label>
                shelf
                <input
                  value={formValues.shelf}
                  aria-label="Quest shelf"
                  inputMode="numeric"
                  placeholder="1"
                  onChange={(event) => setFormValues((current) => ({ ...current, shelf: event.target.value }))}
                />
              </label>
              <label>
                volume
                <input
                  value={formValues.volume}
                  aria-label="Quest volume"
                  inputMode="numeric"
                  placeholder="1"
                  onChange={(event) => setFormValues((current) => ({ ...current, volume: event.target.value }))}
                />
              </label>
              <label>
                page
                <input
                  value={formValues.page}
                  aria-label="Quest page"
                  inputMode="numeric"
                  placeholder="1"
                  onChange={(event) => setFormValues((current) => ({ ...current, page: event.target.value }))}
                />
              </label>
              <button type="submit">test page</button>
            </form>
          </div>
        ) : null}
        {isSignificantWordQuest && questFeedback ? (
          <p className={`quest-feedback ${questFeedback.tone}`} role="status">
            {questFeedback.text}
          </p>
        ) : null}
      </div>
    </section>
  )
}

function npcQuestKicker(quest: LibraryNpc['quest']): string {
  if (quest === 'significant-word') return 'Significant word'
  return quest === 'messiah' ? 'Man of the Book' : 'Crimson rumor'
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

function formatWhole(value: number): string {
  return Math.round(value).toLocaleString('en-US')
}

import { X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import type { LibraryNpc } from '../lib/npcs'
import { QUEST_TARGET_WORD, targetWordOdds } from '../lib/quest'
import type { WordQuestFeedback, WordQuestStatus } from '../lib/significantWordQuest'
import { wordFindingLabel, type WordFinding } from '../lib/wordFinder'

const significantWordOdds = targetWordOdds(QUEST_TARGET_WORD)

export function NpcDialoguePanel({
  npc,
  questStatus,
  questFeedback,
  wordFinding,
  wordFinderFeedback,
  wordFinderSearching,
  onClose,
  onAcceptSignificantWordQuest,
  onCompleteSignificantWordQuest,
  onFindWord,
}: {
  npc: LibraryNpc
  questStatus: WordQuestStatus
  questFeedback: WordQuestFeedback | null
  wordFinding: WordFinding | null
  wordFinderFeedback: string | null
  wordFinderSearching: boolean
  onClose: () => void
  onAcceptSignificantWordQuest: () => void
  onCompleteSignificantWordQuest: () => void
  onFindWord: (word: string) => void
}) {
  const isSignificantWordQuest = npc.quest === 'significant-word'
  const isWordFinder = npc.quest === 'word-finder'
  const [finderWord, setFinderWord] = useState(wordFinding?.word ?? '')

  function submitWord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onFindWord(finderWord)
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
                <p>You have returned with a proven page. Complete the quest with the keeper.</p>
              ) : null}
              {questStatus === 'accepted' ? (
                <p>Your active objective and coordinate ledger are recorded in the Quest Log.</p>
              ) : null}
              {questStatus === 'completed' ? (
                <p>The coordinate is accepted. The stacks fall quiet around the finished quest.</p>
              ) : null}
            </>
          ) : null}
        </div>
        {isWordFinder ? (
          <form className="word-finder-form" aria-label="Ask about a word" onSubmit={submitWord}>
            <label>
              Word
              <input
                value={finderWord}
                aria-label="Word to find"
                maxLength={5}
                autoComplete="off"
                placeholder="babel"
                onChange={(event) => setFinderWord(event.target.value)}
              />
            </label>
            <button type="submit" disabled={wordFinderSearching}>
              {wordFinderSearching ? 'turning the index…' : 'ask the indexer'}
            </button>
          </form>
        ) : null}
        {isWordFinder && wordFinderFeedback ? (
          <p className={`quest-feedback ${wordFinderSearching ? '' : 'error'}`} role="status">
            {wordFinderFeedback}
          </p>
        ) : null}
        {isWordFinder && wordFinding ? (
          <div className="word-finder-result" aria-label="Word finder directions">
            <span>The index opens</span>
            <strong>“{wordFinding.word}”</strong>
            <p>{wordFindingLabel(wordFinding)}</p>
            <small>Find that wall and row, open the numbered book, and turn to the named page.</small>
          </div>
        ) : null}
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
        {isSignificantWordQuest && questFeedback && questStatus !== 'accepted' ? (
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
  if (quest === 'word-finder') return 'Ask about a word'
  return quest === 'messiah' ? 'Man of the Book' : 'Crimson rumor'
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

function formatWhole(value: number): string {
  return Math.round(value).toLocaleString('en-US')
}

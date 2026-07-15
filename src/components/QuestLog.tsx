import { BookOpenText, ChevronDown, ChevronUp } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { QUEST_TARGET_WORD } from '../lib/quest'
import type { WordQuestFeedback, WordQuestFormValues, WordQuestStatus } from '../lib/significantWordQuest'

export function QuestLog({
  status,
  feedback,
  minimized,
  onToggleMinimized,
  onSubmit,
}: {
  status: WordQuestStatus
  feedback: WordQuestFeedback | null
  minimized: boolean
  onToggleMinimized: () => void
  onSubmit: (values: WordQuestFormValues) => void
}) {
  const [formValues, setFormValues] = useState<WordQuestFormValues>({
    floor: '',
    gallery: '',
    wall: '',
    shelf: '',
    volume: '',
    page: '',
  })

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit(formValues)
  }

  return (
    <aside className={`quest-log ${status} ${minimized ? 'minimized' : ''}`} aria-label="Quest log">
      <header className="quest-log-header">
        <BookOpenText size={21} aria-hidden="true" />
        <div>
          <span>Quest Log</span>
          {!minimized ? <strong>Find “{QUEST_TARGET_WORD}”</strong> : null}
        </div>
        <button
          type="button"
          className="quest-log-toggle"
          aria-label={minimized ? 'Expand quest log' : 'Minimize quest log'}
          aria-expanded={!minimized}
          onClick={onToggleMinimized}
        >
          {minimized ? <ChevronDown size={20} aria-hidden="true" /> : <ChevronUp size={20} aria-hidden="true" />}
        </button>
      </header>

      {!minimized ? (
        <div className="quest-log-body">
          {status === 'accepted' ? (
            <>
              <p>Find a page containing “{QUEST_TARGET_WORD}”, then record its complete address.</p>
              <form className="quest-form" aria-label="Submit book coordinates" onSubmit={handleSubmit}>
                <QuestField label="floor" value={formValues.floor} placeholder="0" inputMode="numeric" onChange={(floor) => setFormValues((current) => ({ ...current, floor }))} />
                <QuestField label="gallery" value={formValues.gallery} placeholder="0" inputMode="numeric" onChange={(gallery) => setFormValues((current) => ({ ...current, gallery }))} />
                <QuestField label="wall" value={formValues.wall} placeholder="A" onChange={(wall) => setFormValues((current) => ({ ...current, wall }))} />
                <QuestField label="shelf" value={formValues.shelf} placeholder="1" inputMode="numeric" onChange={(shelf) => setFormValues((current) => ({ ...current, shelf }))} />
                <QuestField label="volume" value={formValues.volume} placeholder="1" inputMode="numeric" onChange={(volume) => setFormValues((current) => ({ ...current, volume }))} />
                <QuestField label="page" value={formValues.page} placeholder="1" inputMode="numeric" onChange={(page) => setFormValues((current) => ({ ...current, page }))} />
                <button type="submit">test page</button>
              </form>
            </>
          ) : null}

          {status === 'ready-to-complete' ? (
            <div className="quest-return" role="status">
              <span>Objective complete</span>
              <strong>Return to the hooded keeper</strong>
              <p>Go back to floor 0, gallery 0, and speak to the monk to turn in the quest.</p>
            </div>
          ) : null}

          {feedback ? <p className={`quest-feedback ${feedback.tone}`}>{feedback.text}</p> : null}
        </div>
      ) : null}
    </aside>
  )
}

function QuestField({
  label,
  value,
  placeholder,
  inputMode,
  onChange,
}: {
  label: string
  value: string
  placeholder: string
  inputMode?: 'numeric'
  onChange: (value: string) => void
}) {
  return (
    <label>
      {label}
      <input
        value={value}
        aria-label={`Quest ${label}`}
        inputMode={inputMode}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

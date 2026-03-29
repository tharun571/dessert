import { ChangeEvent, FormEvent, useState } from 'react';

export interface QuestReflectionAnswers {
  understood: string;
  struggled: string;
  helped: string;
}

interface Props {
  taskTitle: string;
  submitting?: boolean;
  onCancel: () => void;
  onSubmit: (answers: QuestReflectionAnswers) => Promise<void>;
}

const QUESTIONS: { key: keyof QuestReflectionAnswers; label: string }[] = [
  { key: 'understood', label: "1. What did I understand that I didn't before?" },
  { key: 'struggled', label: '2. Where did I struggle or get stuck?' },
  { key: 'helped', label: '3. What helped me move forward?' },
];

export function buildQuestReflectionNotes(
  existingNotes: string | null | undefined,
  answers: QuestReflectionAnswers,
): string {
  const timestamp = new Date().toLocaleString();
  const block = [
    `[quest reflection - ${timestamp}]`,
    '',
    "1) What did I understand that I didn't before?",
    answers.understood.trim(),
    '',
    '2) Where did I struggle or get stuck?',
    answers.struggled.trim(),
    '',
    '3) What helped me move forward?',
    answers.helped.trim(),
  ].join('\n');

  if (existingNotes && existingNotes.trim().length > 0) {
    return `${existingNotes.trim()}\n\n${block}`;
  }
  return block;
}

export default function QuestReflectionModal({
  taskTitle,
  submitting = false,
  onCancel,
  onSubmit,
}: Props) {
  const [answers, setAnswers] = useState<QuestReflectionAnswers>({
    understood: '',
    struggled: '',
    helped: '',
  });
  const [error, setError] = useState('');

  const update =
    (key: keyof QuestReflectionAnswers) =>
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      setAnswers((current) => ({ ...current, [key]: event.target.value }));
    };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const missing = QUESTIONS.find(
      ({ key }) => answers[key].trim().length === 0,
    );
    if (missing) {
      setError('please answer all 3 reflection questions before completing.');
      return;
    }

    setError('');
    try {
      await onSubmit(answers);
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/55 backdrop-blur-sm flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-2xl bg-zinc-950/95 border border-white/10 rounded-2xl p-5"
      >
        <p className="text-xs uppercase tracking-widest text-zinc-500 mb-1">
          quest reflection
        </p>
        <h3 className="text-lg font-semibold text-zinc-100 mb-1">{taskTitle}</h3>
        <p className="text-xs text-zinc-500 mb-4">
          answer these before marking the quest complete.
        </p>

        <div className="space-y-3">
          {QUESTIONS.map((question) => (
            <label key={question.key} className="block">
              <p className="text-sm text-zinc-300 mb-1.5">{question.label}</p>
              <textarea
                value={answers[question.key]}
                onChange={update(question.key)}
                rows={3}
                className="w-full resize-y min-h-[84px] bg-black/35 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-orange-500/50"
                placeholder="type your answer..."
                disabled={submitting}
              />
            </label>
          ))}
        </div>

        {error && (
          <div className="mt-3 bg-red-900/30 border border-red-500/40 rounded-xl p-2.5 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-sm text-zinc-300 disabled:opacity-50"
          >
            cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50"
            style={{
              background: 'linear-gradient(135deg, #f97316 0%, #fb923c 100%)',
            }}
          >
            {submitting ? 'saving...' : 'complete quest'}
          </button>
        </div>
      </form>
    </div>
  );
}

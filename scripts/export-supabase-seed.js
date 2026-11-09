import { writeFile } from 'node:fs/promises'
import { questions } from '../src/data/questions.js'
import { dailyTasks } from '../src/data/dailyTasks.js'

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

function sqlJson(value) {
  return `${sqlText(JSON.stringify(value))}::jsonb`
}

const questionRows = questions.map((question) => `(
  ${sqlText(question.id)}, ${sqlText(question.category)}, ${sqlText(question.difficulty)},
  ${sqlText(question.question)}, ${sqlJson(question.options)}, ${sqlText(question.correctOptionId)},
  ${sqlText(question.explanation)}, ${question.hint ? sqlText(question.hint) : 'null'},
  ${question.interviewLevel ? sqlText(question.interviewLevel) : 'null'}, true
)`).join(',\n')

const dailyRows = dailyTasks.map((task, slot) => `(
  ${sqlText(task.id)}, ${slot}, ${sqlText(task.title)}, ${sqlText(task.prompt)},
  ${sqlJson({ questionId: task.questionId })}, true
)`).join(',\n')

const output = `-- Generated from src/data/questions.js and src/data/dailyTasks.js.
-- Re-running this seed updates matching stable IDs instead of duplicating rows.
insert into public.questions (id, category, difficulty, question_text, options, correct_option_id, explanation, hint, interview_level, is_active)
values ${questionRows}
on conflict (id) do update set
  category = excluded.category,
  difficulty = excluded.difficulty,
  question_text = excluded.question_text,
  options = excluded.options,
  correct_option_id = excluded.correct_option_id,
  explanation = excluded.explanation,
  hint = excluded.hint,
  interview_level = excluded.interview_level,
  is_active = true,
  updated_at = timezone('utc', now());

insert into public.daily_task_templates (id, slot, title, description, content, is_active)
values ${dailyRows}
on conflict (id) do update set
  slot = excluded.slot,
  title = excluded.title,
  description = excluded.description,
  content = excluded.content,
  is_active = true;
`

await writeFile(new URL('../supabase/seed.sql', import.meta.url), output, 'utf8')
console.log(`Подготовлено ${questions.length} вопросов и ${dailyTasks.length} шаблонов QA Daily.`)
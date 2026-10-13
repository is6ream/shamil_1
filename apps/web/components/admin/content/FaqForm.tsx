"use client";

import { Note } from "@/components/admin/ui/Blocks";
import { Button } from "@/components/admin/ui/Button";
import { TextAreaField, TextField } from "@/components/admin/ui/Field";
import { FAQ_ITEMS_MAX, checkFaq } from "@/lib/admin/content";
import { moveItem } from "@/lib/admin/reorder";
import type { FaqBlock, FaqItem } from "@/lib/admin/types";

import { BlockForm, ListItem } from "./BlockForm";
import styles from "./content.module.css";
import { useBlockForm } from "./use-block-form";

export function FaqForm({ initial, onSaved }: { readonly initial: FaqBlock; readonly onSaved: () => void }) {
  const form = useBlockForm("faq", initial, checkFaq, onSaved);
  const { draft, update, errors } = form;

  function setItem(index: number, change: Partial<FaqItem>) {
    update({ items: draft.items.map((item, position) => (position === index ? { ...item, ...change } : item)) });
  }

  return (
    <>
      <Note>
        <p>
          <b>На сайте вопросы пока не показываются</b> — блока для них в макете нет. Ответы можно готовить заранее.
        </p>
      </Note>
      <BlockForm
        isPending={form.isPending}
        isDirty={form.isDirty}
        serverErrors={form.serverErrors}
        hasErrors={Object.keys(errors).length > 0}
        onSubmit={() => void form.save()}
      >
        {errors.items ? <p className={styles.error}>{errors.items}</p> : null}
        {draft.items.length === 0 ? <p className={styles.hint}>Вопросов пока нет.</p> : null}
        <ol className={styles.list}>
          {draft.items.map((item, index) => (
            <ListItem
              key={index}
              label={`вопрос ${index + 1}`}
              index={index}
              count={draft.items.length}
              onMove={(from, delta) => update({ items: moveItem(draft.items, from, delta) })}
              onRemove={() => update({ items: draft.items.filter((_, position) => position !== index) })}
            >
              <TextField
                label={`Вопрос ${index + 1}`}
                value={item.question}
                maxLength={300}
                onChange={(e) => setItem(index, { question: e.target.value })}
                error={errors[`items.${index}.question`]}
              />
              <TextAreaField
                label="Ответ"
                value={item.answer}
                maxLength={3000}
                rows={3}
                onChange={(e) => setItem(index, { answer: e.target.value })}
                error={errors[`items.${index}.answer`]}
              />
            </ListItem>
          ))}
        </ol>
        <Button
          variant="ghost"
          isSmall
          disabled={draft.items.length >= FAQ_ITEMS_MAX}
          onClick={() => update({ items: [...draft.items, { question: "", answer: "" }] })}
        >
          Добавить вопрос
        </Button>
      </BlockForm>
    </>
  );
}

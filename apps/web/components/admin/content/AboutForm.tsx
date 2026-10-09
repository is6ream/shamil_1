"use client";

import { MediaField } from "@/components/admin/media/MediaField";
import { Button } from "@/components/admin/ui/Button";
import { TextAreaField, TextField } from "@/components/admin/ui/Field";
import { ABOUT_FACTS_MAX, checkAbout } from "@/lib/admin/content";
import { moveItem } from "@/lib/admin/reorder";
import type { AboutBlock, AboutFact } from "@/lib/admin/types";

import { BlockForm, ListItem } from "./BlockForm";
import styles from "./content.module.css";
import { useBlockForm } from "./use-block-form";

export function AboutForm({ initial, onSaved }: { readonly initial: AboutBlock; readonly onSaved: () => void }) {
  const form = useBlockForm("about", initial, checkAbout, onSaved);
  const { draft, update, errors } = form;

  function setFact(index: number, change: Partial<AboutFact>) {
    update({ facts: draft.facts.map((fact, position) => (position === index ? { ...fact, ...change } : fact)) });
  }

  return (
    <BlockForm
      isPending={form.isPending}
      isDirty={form.isDirty}
      serverErrors={form.serverErrors}
      hasErrors={Object.keys(errors).length > 0}
      onSubmit={() => void form.save()}
    >
      <TextField label="Надпись над заголовком" value={draft.eyebrow} maxLength={60} onChange={(e) => update({ eyebrow: e.target.value })} error={errors.eyebrow} />
      <TextField label="Заголовок" value={draft.title} maxLength={160} onChange={(e) => update({ title: e.target.value })} error={errors.title} />
      <TextAreaField
        label="Текст о проекте"
        value={draft.text ?? ""}
        maxLength={3000}
        rows={6}
        onChange={(e) => update({ text: e.target.value })}
        error={errors.text}
        hint="Пусто — абзац на сайте не выводится. Простой текст, без разметки."
      />
      <MediaField
        label="Эскиз фасада"
        mediaId={draft.facadeMediaId}
        hint="на сайте стоит заглушка"
        onChange={(facadeMediaId) => update({ facadeMediaId })}
      />
      <TextField label="Подпись к эскизу" value={draft.facadeCaption} maxLength={160} onChange={(e) => update({ facadeCaption: e.target.value })} error={errors.facadeCaption} />

      <fieldset className={styles.fieldset}>
        <legend>Факты о мечети (до {ABOUT_FACTS_MAX})</legend>
        <p className={styles.hint}>Число, единица и подпись: «500» · «» · «молящихся вмещает мечеть». Пустое поле не выводится.</p>
        {errors.facts ? <p className={styles.error}>{errors.facts}</p> : null}
        <ol className={styles.list}>
          {draft.facts.map((fact, index) => (
            <ListItem
              key={index}
              label={`факт ${index + 1}`}
              index={index}
              count={draft.facts.length}
              onMove={(from, delta) => update({ facts: moveItem(draft.facts, from, delta) })}
              onRemove={() => update({ facts: draft.facts.filter((_, position) => position !== index) })}
            >
              <div className={styles.factRow}>
                <TextField label="Значение" value={fact.value ?? ""} maxLength={40} onChange={(e) => setFact(index, { value: e.target.value })} error={errors[`facts.${index}.value`]} />
                <TextField label="Единица" value={fact.unit ?? ""} maxLength={16} onChange={(e) => setFact(index, { unit: e.target.value })} error={errors[`facts.${index}.unit`]} />
                <TextField label="Подпись" value={fact.label ?? ""} maxLength={120} onChange={(e) => setFact(index, { label: e.target.value })} error={errors[`facts.${index}.label`]} />
              </div>
            </ListItem>
          ))}
        </ol>
        <Button
          variant="ghost"
          isSmall
          disabled={draft.facts.length >= ABOUT_FACTS_MAX}
          onClick={() => update({ facts: [...draft.facts, { value: "", unit: null, label: "" }] })}
        >
          Добавить факт
        </Button>
      </fieldset>
    </BlockForm>
  );
}

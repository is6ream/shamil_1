"use client";

import { MediaField } from "@/components/admin/media/MediaField";
import { FieldGrid } from "@/components/admin/ui/Blocks";
import { Button } from "@/components/admin/ui/Button";
import { TextAreaField, TextField } from "@/components/admin/ui/Field";
import { HERO_TRUST_MAX, checkHero } from "@/lib/admin/content";
import { moveItem } from "@/lib/admin/reorder";
import type { HeroBlock } from "@/lib/admin/types";

import { BlockForm, ListItem } from "./BlockForm";
import styles from "./content.module.css";
import { useBlockForm } from "./use-block-form";

export function HeroForm({ initial, onSaved }: { readonly initial: HeroBlock; readonly onSaved: () => void }) {
  const form = useBlockForm("hero", initial, checkHero, onSaved);
  const { draft, update, errors } = form;

  return (
    <BlockForm
      isPending={form.isPending}
      isDirty={form.isDirty}
      serverErrors={form.serverErrors}
      hasErrors={Object.keys(errors).length > 0}
      onSubmit={() => void form.save()}
    >
      <FieldGrid>
        <TextField label="Плашка над заголовком" value={draft.badge} maxLength={80} onChange={(e) => update({ badge: e.target.value })} error={errors.badge} />
        <TextField label="Текст кнопки" value={draft.helpButton} maxLength={40} onChange={(e) => update({ helpButton: e.target.value })} error={errors.helpButton} />
      </FieldGrid>
      <TextField label="Заголовок" value={draft.title} maxLength={160} onChange={(e) => update({ title: e.target.value })} error={errors.title} />
      <TextAreaField label="Текст под заголовком" value={draft.lede} maxLength={600} rows={4} onChange={(e) => update({ lede: e.target.value })} error={errors.lede} />
      <TextAreaField
        label="Короткий текст для телефона"
        value={draft.ledeShort}
        maxLength={300}
        rows={2}
        onChange={(e) => update({ ledeShort: e.target.value })}
        error={errors.ledeShort}
        hint="На телефоне длинный текст не помещается на первый экран."
      />

      <fieldset className={styles.fieldset}>
        <legend>Пункты доверия (1–{HERO_TRUST_MAX})</legend>
        {errors.trust ? <p className={styles.error}>{errors.trust}</p> : null}
        <ol className={styles.list}>
          {draft.trust.map((item, index) => (
            <ListItem
              key={index}
              label={`пункт ${index + 1}`}
              index={index}
              count={draft.trust.length}
              onMove={(from, delta) => update({ trust: moveItem(draft.trust, from, delta) })}
              onRemove={() => update({ trust: draft.trust.filter((_, position) => position !== index) })}
            >
              <TextField
                label={`Пункт ${index + 1}`}
                value={item}
                maxLength={80}
                onChange={(e) => update({ trust: draft.trust.map((value, position) => (position === index ? e.target.value : value)) })}
                error={errors[`trust.${index}`]}
              />
            </ListItem>
          ))}
        </ol>
        <Button variant="ghost" isSmall disabled={draft.trust.length >= HERO_TRUST_MAX} onClick={() => update({ trust: [...draft.trust, ""] })}>
          Добавить пункт
        </Button>
      </fieldset>

      <MediaField
        label="Рендер или фото мечети"
        mediaId={draft.renderMediaId}
        hint="на сайте стоит заглушка"
        onChange={(renderMediaId) => update({ renderMediaId })}
      />
      <TextField
        label="Подпись к картинке"
        value={draft.renderCaption}
        maxLength={160}
        onChange={(e) => update({ renderCaption: e.target.value })}
        error={errors.renderCaption}
      />
    </BlockForm>
  );
}

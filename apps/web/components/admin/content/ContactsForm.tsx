"use client";

import { FieldGrid } from "@/components/admin/ui/Blocks";
import { TextField } from "@/components/admin/ui/Field";
import { checkContacts } from "@/lib/admin/content";
import type { ContactsBlock } from "@/lib/admin/types";

import { BlockForm } from "./BlockForm";
import { useBlockForm } from "./use-block-form";

export function ContactsForm({ initial, onSaved }: { readonly initial: ContactsBlock; readonly onSaved: () => void }) {
  const form = useBlockForm("contacts", initial, checkContacts, onSaved);
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
        <TextField
          label="Телефон"
          type="tel"
          value={draft.phone ?? ""}
          onChange={(e) => update({ phone: e.target.value })}
          error={errors.phone}
          hint="Например: +7 (917) 756-77-77"
        />
        <TextField
          label="Электронная почта"
          type="email"
          value={draft.email ?? ""}
          onChange={(e) => update({ email: e.target.value })}
          error={errors.email}
        />
        <TextField
          label="Telegram-канал"
          value={draft.telegramChannel ?? ""}
          onChange={(e) => update({ telegramChannel: e.target.value })}
          error={errors.telegramChannel}
          hint="Имя канала без @, например mechetshamil."
        />
      </FieldGrid>
      <TextField
        label="Адрес мечети"
        value={draft.mosqueAddress ?? ""}
        maxLength={300}
        onChange={(e) => update({ mosqueAddress: e.target.value })}
        error={errors.mosqueAddress}
        hint="Пустое поле на сайте не выводится."
      />
    </BlockForm>
  );
}

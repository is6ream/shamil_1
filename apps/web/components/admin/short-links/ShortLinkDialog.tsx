"use client";

import { useState } from "react";
import type { FormEvent } from "react";

import { FormActions, Note } from "@/components/admin/ui/Blocks";
import { Button } from "@/components/admin/ui/Button";
import { CheckboxField, FormErrors, TextField } from "@/components/admin/ui/Field";
import { Modal } from "@/components/admin/ui/Modal";
import { SAVED_MESSAGE, useToast } from "@/components/admin/ui/Toasts";
import type { AdminClient } from "@/lib/admin/api-client";
import {
  EMPTY_SHORT_LINK_FORM,
  SHORT_LINK_PATH_MAX,
  SHORT_LINK_SLUG_MAX,
  SHORT_LINK_TITLE_MAX,
  UTM_VALUE_MAX,
  checkShortLinkForm,
} from "@/lib/admin/attribution";
import type { ShortLinkForm } from "@/lib/admin/attribution";
import { ADMIN_PATHS } from "@/lib/admin/endpoints";
import { useAdminMutation } from "@/lib/admin/hooks";
import type { AdminShortLink, ShortLinkBody } from "@/lib/admin/types";

import styles from "./short-links.module.css";

interface SaveArgs {
  readonly id: string | null;
  readonly body: ShortLinkBody;
}

function saveShortLink(client: AdminClient, { id, body }: SaveArgs): Promise<AdminShortLink> {
  return id === null
    ? client.request<AdminShortLink>(ADMIN_PATHS.shortLinks, { method: "POST", body })
    : client.request<AdminShortLink>(ADMIN_PATHS.shortLink(id), { method: "PATCH", body });
}

function toForm(link: AdminShortLink): ShortLinkForm {
  return {
    slug: link.slug,
    title: link.title,
    targetPath: link.targetPath,
    utmSource: link.utm.source,
    utmMedium: link.utm.medium ?? "",
    utmCampaign: link.utm.campaign ?? "",
    utmContent: link.utm.content ?? "",
    utmTerm: link.utm.term ?? "",
    isActive: link.isActive,
  };
}

interface Props {
  readonly link: AdminShortLink | "new" | null;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}

export function ShortLinkDialog({ link, onClose, onSaved }: Props) {
  return (
    <Modal isOpen={link !== null} title={link === "new" ? "Новая короткая ссылка" : "Короткая ссылка"} onClose={onClose}>
      {link === null ? null : <ShortLinkFormBody link={link} onClose={onClose} onSaved={onSaved} />}
    </Modal>
  );
}

function ShortLinkFormBody({ link, onClose, onSaved }: { readonly link: AdminShortLink | "new" } & Omit<Props, "link">) {
  const toast = useToast();
  const isNew = link === "new";
  const [form, setForm] = useState<ShortLinkForm>(() => (isNew ? EMPTY_SHORT_LINK_FORM : toForm(link)));
  const [isTouched, setIsTouched] = useState(false);
  const mutation = useAdminMutation(saveShortLink);
  const check = checkShortLinkForm(form, isNew);
  const errors = isTouched && !check.ok ? check.errors : {};

  function set<K extends keyof ShortLinkForm>(key: K, value: ShortLinkForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsTouched(true);

    if (!check.ok) {
      return;
    }

    const saved = await mutation.run({ id: isNew ? null : link.id, body: check.body });

    if (saved !== undefined) {
      toast.success(SAVED_MESSAGE);
      onSaved();
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className={styles.form}>
      <Note>
        <p>
          Короткая ссылка ведёт на сайт и добавляет к адресу метки — по ним в разделе «Источники» видно, сколько
          пожертвований принёс баннер или пост. Для QR на печать выбирайте короткий адрес: его иногда диктуют голосом.
        </p>
      </Note>
      {isNew ? (
        <TextField
          label="Адрес: mechetshamil.ru/go/…"
          value={form.slug}
          maxLength={SHORT_LINK_SLUG_MAX}
          autoComplete="off"
          onChange={(event) => set("slug", event.target.value)}
          error={errors.slug}
          hint="Строчные латинские буквы, цифры и дефис: banner-mosque. После создания не меняется — его напечатают."
          data-autofocus
        />
      ) : (
        <p className={styles.url}>{link.shortUrl}</p>
      )}
      <TextField
        label="Подпись для себя"
        value={form.title}
        maxLength={SHORT_LINK_TITLE_MAX}
        onChange={(event) => set("title", event.target.value)}
        error={errors.title}
        hint="Где висит или куда отправлена: «Баннер у входа в мечеть», «Пост в канале 12.10»."
      />
      <TextField
        label="Страница сайта"
        value={form.targetPath}
        maxLength={SHORT_LINK_PATH_MAX}
        onChange={(event) => set("targetPath", event.target.value)}
        error={errors.targetPath}
        hint="/ — главная, /02/ — страница Башкортостана."
      />
      <div className={styles.utm}>
        <TextField
          label="Источник (utm_source)"
          value={form.utmSource}
          maxLength={UTM_VALUE_MAX}
          onChange={(event) => set("utmSource", event.target.value)}
          error={errors.utmSource}
          hint="telegram, instagram, qr"
        />
        <TextField
          label="Канал (utm_medium)"
          value={form.utmMedium}
          maxLength={UTM_VALUE_MAX}
          onChange={(event) => set("utmMedium", event.target.value)}
          error={errors.utmMedium}
          hint="social, offline, partner"
        />
        <TextField
          label="Кампания (utm_campaign)"
          value={form.utmCampaign}
          maxLength={UTM_VALUE_MAX}
          onChange={(event) => set("utmCampaign", event.target.value)}
          error={errors.utmCampaign}
          hint="ramadan-2026"
        />
        <TextField
          label="Объявление (utm_content)"
          value={form.utmContent}
          maxLength={UTM_VALUE_MAX}
          onChange={(event) => set("utmContent", event.target.value)}
          error={errors.utmContent}
          hint="banner-entrance"
        />
      </div>
      <CheckboxField
        label="Ссылка работает"
        checked={form.isActive}
        onChange={(event) => set("isActive", event.target.checked)}
        hint="Выключенная ссылка ведёт на главную — QR не сломается, но клики считаться перестанут."
      />
      <FormErrors messages={mutation.errors} />
      <FormActions>
        <Button type="submit" isBusy={mutation.isPending}>
          Сохранить
        </Button>
        <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
          Отмена
        </Button>
      </FormActions>
    </form>
  );
}

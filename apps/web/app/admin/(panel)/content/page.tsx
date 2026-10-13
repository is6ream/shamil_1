"use client";

import { useState } from "react";

import { AdminPage } from "@/components/admin/AdminPage";
import { AboutForm } from "@/components/admin/content/AboutForm";
import { ContactsForm } from "@/components/admin/content/ContactsForm";
import styles from "@/components/admin/content/content.module.css";
import { FaqForm } from "@/components/admin/content/FaqForm";
import { HeroForm } from "@/components/admin/content/HeroForm";
import { RequisitesForm } from "@/components/admin/content/RequisitesForm";
import { Note, Section } from "@/components/admin/ui/Blocks";
import { ErrorState, LoadingState } from "@/components/admin/ui/StateViews";
import { CONTENT_KEYS, DEFAULT_BLOCKS } from "@/lib/admin/content";
import { ADMIN_PATHS } from "@/lib/admin/endpoints";
import { useAdminQuery } from "@/lib/admin/hooks";
import { useAdminSession } from "@/lib/admin/session";
import { formatDateTime } from "@/lib/admin/time";
import type { AdminBlock, ContentBlocks, ContentKey } from "@/lib/admin/types";

const TAB_LABELS: Readonly<Record<ContentKey, string>> = {
  hero: "Первый экран",
  about: "О проекте",
  contacts: "Контакты",
  requisites: "Реквизиты",
  faq: "Вопросы",
};

function blockOf<K extends ContentKey>(blocks: readonly AdminBlock[], key: K): AdminBlock<K> | undefined {
  return blocks.find((block): block is AdminBlock<K> => block.key === key);
}

interface EditorProps {
  readonly blockKey: ContentKey;
  readonly saved: AdminBlock | undefined;
  readonly onSaved: () => void;
}

/** Форма блока; не заполненный ещё блок предзаполнен текущим хардкодом сайта. */
function BlockEditor({ blockKey, saved, onSaved }: EditorProps) {
  const data = saved?.data ?? DEFAULT_BLOCKS[blockKey];

  switch (blockKey) {
    case "hero":
      return <HeroForm initial={data as ContentBlocks["hero"]} onSaved={onSaved} />;
    case "about":
      return <AboutForm initial={data as ContentBlocks["about"]} onSaved={onSaved} />;
    case "contacts":
      return <ContactsForm initial={data as ContentBlocks["contacts"]} onSaved={onSaved} />;
    case "requisites":
      return <RequisitesForm initial={data as ContentBlocks["requisites"]} onSaved={onSaved} />;
    case "faq":
      return <FaqForm initial={data as ContentBlocks["faq"]} onSaved={onSaved} />;
  }
}

export default function ContentPage() {
  const { can } = useAdminSession();
  const { data, error, isLoading, reload } = useAdminQuery<readonly AdminBlock[]>(ADMIN_PATHS.content);
  // Реквизиты — только суперадмину (D-17): у редактора вкладки нет вовсе.
  const tabs = CONTENT_KEYS.filter((key) => key !== "requisites" || can("requisites"));
  const [active, setActive] = useState<ContentKey>("hero");

  return (
    <AdminPage
      title="Тексты сайта"
      lead="Тексты главной страницы. Хадисы, слоган и юридические данные организации здесь не меняются — их выверяет имам и правит разработчик."
    >
      <div className={styles.tabs} role="tablist" aria-label="Блоки сайта">
        {tabs.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`tab-${key}`}
            aria-selected={active === key}
            aria-controls="content-panel"
            className={styles.tab}
            onClick={() => setActive(key)}
          >
            {TAB_LABELS[key]}
          </button>
        ))}
      </div>

      <div id="content-panel" role="tabpanel" aria-labelledby={`tab-${active}`}>
        {isLoading ? <LoadingState /> : null}
        {error ? <ErrorState message={error} onRetry={reload} /> : null}
        {data !== null
          ? tabs.map((key) => {
              const saved = blockOf(data, key);
              const formKey = `${key}:${saved?.updatedAt ?? "default"}`;

              // Все формы смонтированы, неактивные скрыты: переключение вкладок
              // не теряет черновик.
              return (
                <div key={key} hidden={key !== active}>
                  <Section>
                    <p className={styles.updated}>
                      {saved
                        ? `Последнее сохранение: ${formatDateTime(saved.updatedAt)}`
                        : "Блок ещё не сохранялся — в форме текущие тексты сайта."}
                    </p>
                    <BlockEditor key={formKey} blockKey={key} saved={saved} onSaved={reload} />
                  </Section>
                </div>
              );
            })
          : null}
      </div>

      {!can("requisites") ? (
        <Note>
          <p>Реквизиты расчётного счёта меняет только суперадмин.</p>
        </Note>
      ) : null}
    </AdminPage>
  );
}

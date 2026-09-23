import { ORGANIZATION } from "@/lib/organization";

/**
 * Футер — не декоративный: сбор на 240 млн без уставных документов на виду
 * это красный флаг для всякого, кто читал про мошеннические сборы, и
 * требование законодательства о благотворительности (CLAUDE.md).
 *
 * Всё, чего ещё нет, помечено как «ожидается» видимым текстом, а не пустой
 * ссылкой: битая ссылка на устав хуже честного «документ готовится».
 */
export function SiteFooter() {
  return (
    <footer id="docs">
      <div className="wrap">
        <div className="fcols">
          <div>
            <h3>{ORGANIZATION.shortName}</h3>
            <p>{ORGANIZATION.legalName}</p>
            <p>
              ИНН {ORGANIZATION.inn}
              {ORGANIZATION.ogrn === null ? null : <> · ОГРН {ORGANIZATION.ogrn}</>}
              <br />
              {ORGANIZATION.address ?? "Юридический адрес — уточняется"}
            </p>
          </div>

          <div>
            <h3>Документы</h3>
            <div className="docs">
              {ORGANIZATION.documents.map((document) =>
                document.url === null ? (
                  <span className="doc" key={document.title} aria-disabled="true">
                    {document.title} — готовится
                  </span>
                ) : (
                  <a className="doc" key={document.title} href={document.url}>
                    {document.title}
                  </a>
                ),
              )}
            </div>
          </div>

          <div>
            <h3>Контакты</h3>
            <p>
              {ORGANIZATION.phone ?? "Телефон — уточняется"}
              <br />
              {ORGANIZATION.mosqueAddress ?? "Адрес мечети — уточняется"}
            </p>
            <div className="legal">
              {ORGANIZATION.legalPages.map((page) => (
                <span className="doc" key={page} aria-disabled="true">
                  {page} — готовится
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

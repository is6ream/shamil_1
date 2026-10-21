import { SimplePage } from "@/components/layout/SimplePage";
import type { LegalDocumentData } from "@/lib/legal/types";

import { LegalDocument } from "./LegalDocument";

/** Страница юридического документа: заголовок и подзаголовок из самого документа. */
export function LegalPage({ document }: { readonly document: LegalDocumentData }) {
  return (
    <SimplePage title={document.title} lede={document.subtitle}>
      <LegalDocument document={document} />
    </SimplePage>
  );
}

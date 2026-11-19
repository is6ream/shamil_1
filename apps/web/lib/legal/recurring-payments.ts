import { links, p, unnumberedSection } from "./builders";
import type { LegalDocumentData } from "./types";
import {
  EMAIL_TERMS_SECTIONS,
  EMAIL_TERMS_SUBTITLE,
  EMAIL_TERMS_TITLE,
} from "../../../api/src/payments/recurring/terms-email";

export const RECURRING_PAYMENTS: LegalDocumentData = {
  title: EMAIL_TERMS_TITLE,
  subtitle: EMAIL_TERMS_SUBTITLE,
  sections: EMAIL_TERMS_SECTIONS.map(({ title, blocks }) => unnumberedSection(
    title,
    ...blocks.map(block => typeof block === "string" ? p(block) : links(...block)),
  )),
};

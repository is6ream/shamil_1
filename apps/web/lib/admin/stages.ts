/** Форма этапа стройки (API.md §11). */

import { LIMITS } from "./endpoints";
import { checkRublesInput, kopecksToRublesInput } from "./money";
import type { AdminStage, StageBody, StageStatus } from "./types";

export const STAGE_TITLE_MAX = 200;
export const STAGE_DESCRIPTION_MAX = 5000;

export interface StagePhoto {
  readonly id: string;
  readonly url: string;
}

export interface StageForm {
  readonly title: string;
  readonly status: StageStatus;
  readonly description: string;
  /** Рубли; пусто — сумма «не названа». */
  readonly budget: string;
  readonly spent: string;
  readonly photos: readonly StagePhoto[];
}

export type StageErrors = Partial<Record<keyof StageForm, string>>;

export type StageCheck = { readonly ok: true; readonly body: StageBody } | { readonly ok: false; readonly errors: StageErrors };

export const EMPTY_STAGE_FORM: StageForm = {
  title: "",
  status: "upcoming",
  description: "",
  budget: "",
  spent: "",
  photos: [],
};

/** Фото этапа: `photoMediaIds` и `photos` идут в одном порядке. */
export function stageToForm(stage: AdminStage): StageForm {
  return {
    title: stage.title,
    status: stage.status,
    description: stage.description ?? "",
    budget: kopecksToRublesInput(stage.budgetKopecks),
    spent: kopecksToRublesInput(stage.spentKopecks),
    photos: stage.photoMediaIds.map((id, index) => ({ id, url: stage.photos[index]?.urls.sm ?? "" })),
  };
}

function optionalAmount(raw: string): { kopecks: string | null; error?: string } {
  if (raw.trim() === "") {
    return { kopecks: null };
  }

  const check = checkRublesInput(raw, { min: "0", max: LIMITS.stageMaxKopecks, maxLabel: "2 400 000 000 ₽" });

  return check.ok ? { kopecks: check.kopecks } : { kopecks: null, error: check.error };
}

export function checkStage(form: StageForm): StageCheck {
  const errors: StageErrors = {};
  const title = form.title.trim();
  const description = form.description.trim();
  const budget = optionalAmount(form.budget);
  const spent = optionalAmount(form.spent);

  if (title === "" || title.length > STAGE_TITLE_MAX) {
    errors.title = `Название — от 1 до ${STAGE_TITLE_MAX} символов.`;
  }

  if (description.length > STAGE_DESCRIPTION_MAX) {
    errors.description = `Описание — не длиннее ${STAGE_DESCRIPTION_MAX} символов.`;
  }

  if (budget.error) {
    errors.budget = budget.error;
  }

  if (spent.error) {
    errors.spent = spent.error;
  }

  if (form.photos.length > LIMITS.stagePhotos) {
    errors.photos = `Не больше ${LIMITS.stagePhotos} фото у этапа.`;
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    body: {
      title,
      status: form.status,
      description: description === "" ? null : description,
      budgetKopecks: budget.kopecks,
      spentKopecks: spent.kopecks,
      photoMediaIds: form.photos.map((photo) => photo.id),
    },
  };
}

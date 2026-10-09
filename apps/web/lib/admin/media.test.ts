import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { AdminApiError } from "./errors";
import { checkUploadFile, usagesFromError } from "./media";

const MB = 1024 * 1024;

describe("checkUploadFile", () => {
  test("JPEG до 15 МБ проходит", () => {
    assert.equal(checkUploadFile({ name: "a.jpg", type: "image/jpeg", size: 3 * MB }), null);
  });

  test("HEIC с iPhone — совет сохранить как JPEG", () => {
    assert.match(checkUploadFile({ name: "IMG_1.HEIC", type: "", size: MB }) ?? "", /JPEG/);
    assert.match(checkUploadFile({ name: "x", type: "image/heic", size: MB }) ?? "", /HEIC/);
  });

  test("больше 15 МБ и чужой формат", () => {
    assert.match(checkUploadFile({ name: "big.png", type: "image/png", size: 16 * MB }) ?? "", /15 МБ/);
    assert.match(checkUploadFile({ name: "a.gif", type: "image/gif", size: MB }) ?? "", /не фото/);
  });

  test("пустой тип, но расширение jpeg — пропускаем, сервер проверит содержимое", () => {
    assert.equal(checkUploadFile({ name: "photo.jpeg", type: "", size: MB }), null);
  });
});

describe("usagesFromError", () => {
  test("409 с usages разбирается, мусор отбрасывается", () => {
    const error = new AdminApiError(409, ["Файл используется"], {
      message: "Файл используется",
      usages: [
        { entityType: "gallery_item", entityId: "g1", label: "Фундамент" },
        { entityType: "unknown", entityId: "x", label: "?" },
      ],
    });

    assert.deepEqual(usagesFromError(error), [{ entityType: "gallery_item", entityId: "g1", label: "Фундамент" }]);
  });

  test("другая ошибка — пусто", () => {
    assert.deepEqual(usagesFromError(new AdminApiError(400, ["x"])), []);
  });
});

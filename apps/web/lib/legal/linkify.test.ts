import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { linkify } from "./linkify";

describe("linkify", () => {
  it("оставляет текст без ссылок одним куском", () => {
    assert.deepEqual(linkify("Просто текст."), [{ kind: "text", value: "Просто текст." }]);
  });

  it("не включает завершающую точку и скобку в URL", () => {
    assert.deepEqual(linkify("по адресу https://mechetshamil.ru/ (далее — «Сайт»)."), [
      { kind: "text", value: "по адресу " },
      { kind: "link", value: "https://mechetshamil.ru/", href: "https://mechetshamil.ru/" },
      { kind: "text", value: " (далее — «Сайт»)." },
    ]);

    assert.deepEqual(linkify("адресу: http://legal.yandex.ru/confidential/."), [
      { kind: "text", value: "адресу: " },
      {
        kind: "link",
        value: "http://legal.yandex.ru/confidential/",
        href: "http://legal.yandex.ru/confidential/",
      },
      { kind: "text", value: "." },
    ]);
  });

  it("превращает e-mail в mailto-ссылку", () => {
    assert.deepEqual(linkify("почте: mechet.shamil@yandex.com с пометкой"), [
      { kind: "text", value: "почте: " },
      {
        kind: "link",
        value: "mechet.shamil@yandex.com",
        href: "mailto:mechet.shamil@yandex.com",
      },
      { kind: "text", value: " с пометкой" },
    ]);
  });
});

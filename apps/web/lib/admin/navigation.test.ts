import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { ADMIN_SECTIONS, findSection, menuGroups, mobileTabs, sectionBySlug, visibleSections } from "./navigation";
import { can } from "./roles";
import type { AdminRole } from "./roles";

const canAs = (role: AdminRole) => (permission: Parameters<typeof can>[1]) => can(role, permission);
const hrefs = (sections: readonly { readonly href: string }[]) => sections.map((section) => section.href);

describe("разделы: маршруты не меняются", () => {
  test("все прежние адреса на месте", () => {
    assert.deepEqual(hrefs(ADMIN_SECTIONS).sort(), [
      "/admin",
      "/admin/account",
      "/admin/audit",
      "/admin/content",
      "/admin/donations",
      "/admin/gallery",
      "/admin/goals",
      "/admin/media",
      "/admin/news",
      "/admin/short-links",
      "/admin/sources",
      "/admin/stages",
      "/admin/users",
      "/admin/video",
    ]);
  });

  test("вложенная страница относится к своему разделу, главная — только к себе", () => {
    assert.equal(findSection("/admin/donations/abc")?.href, "/admin/donations");
    assert.equal(findSection("/admin/news/new")?.href, "/admin/news");
    assert.equal(findSection("/admin")?.href, "/admin");
    assert.equal(findSection("/admin/nope"), undefined);
    assert.equal(sectionBySlug("media")?.href, "/admin/media");
  });
});

describe("меню по ролям", () => {
  test("редактор не видит пользователей и журнал", () => {
    const visible = hrefs(visibleSections(canAs("EDITOR")));

    assert.ok(!visible.includes("/admin/users"));
    assert.ok(!visible.includes("/admin/audit"));
    assert.ok(visible.includes("/admin/stages"));
  });

  test("группы идут по порядку, пустые группы выпадают, «Сменить пароль» — не в меню", () => {
    const groups = menuGroups(canAs("ACCOUNTANT"));

    assert.deepEqual(
      groups.map((group) => group.title),
      [null, "Сбор", "Управление"],
    );
    assert.ok(groups.every((group) => group.sections.every((section) => section.href !== "/admin/account")));
  });
});

describe("нижняя панель на телефоне", () => {
  test("суперадмин и редактор: обзор, пожертвования, стройка, медиатека", () => {
    assert.deepEqual(hrefs(mobileTabs(canAs("SUPER_ADMIN"))), [
      "/admin",
      "/admin/donations",
      "/admin/stages",
      "/admin/media",
    ]);
    assert.deepEqual(hrefs(mobileTabs(canAs("EDITOR"))), hrefs(mobileTabs(canAs("SUPER_ADMIN"))));
  });

  test("бухгалтер: обзор, пожертвования, цели, журнал", () => {
    assert.deepEqual(hrefs(mobileTabs(canAs("ACCOUNTANT"))), [
      "/admin",
      "/admin/donations",
      "/admin/goals",
      "/admin/audit",
    ]);
  });
});

/**
 * Что подставить в форму доната вошедшему жертвователю.
 *
 * Галочка «анонимно» по умолчанию следует настройке «показывать имя
 * и регион в ленте» (решение заказчика 27.10.2026): без согласия на
 * распространение ПДн она остаётся включённой, а имя не подставляется —
 * анонимному донату публичная подпись запрещена CHECK-ом в базе.
 */

import { displayName } from "./profile-view";
import type { DonorProfile } from "./types";

export interface DonationDefaults {
  readonly isAnonymous: boolean;
  /** Публичная подпись; пустая при анонимности. */
  readonly donorName: string;
  /** Телефон из профиля (E.164) или пустая строка. Виден только без анонимности. */
  readonly phone: string;
  /** Регион профиля — если человек пришёл не по региональной ссылке. */
  readonly regionSlug: string | null;
}

export function donationDefaults(profile: DonorProfile, hasLinkRegion: boolean): DonationDefaults {
  const isAnonymous = !profile.showInFeed;

  return {
    isAnonymous,
    donorName: isAnonymous ? "" : (displayName(profile) ?? ""),
    phone: isAnonymous ? "" : (profile.phone ?? ""),
    // Ссылка за свой регион — осознанный выбор активиста, её не перебиваем.
    regionSlug: hasLinkRegion ? null : (profile.region?.slug ?? null),
  };
}

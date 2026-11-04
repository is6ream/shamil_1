/** Ответы `/donor/*` — зеркало DTO бэкенда. Суммы — копейки строкой. */

export interface LoginMethods {
  readonly email: boolean;
  readonly vk: boolean;
}

export interface DonorSessionResponse {
  readonly accessToken: string;
  readonly expiresIn: number;
  readonly donorId: string;
  readonly email: string | null;
  readonly isNew: boolean;
}

export interface DonorRegion {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly type: "country" | "subject";
  /** Страна субъекта; у страны — `null`. */
  readonly countryName: string | null;
}

export interface DonorProfile {
  readonly id: string;
  readonly email: string | null;
  readonly vkLinked: boolean;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly middleName: string | null;
  readonly phone: string | null;
  readonly region: DonorRegion | null;
  readonly city: string | null;
  readonly showInFeed: boolean;
  readonly createdAt: string;
}

export interface DonorSummary {
  readonly year: number;
  readonly yearTotalKopecks: string;
  readonly donationsCount: number;
  readonly memberSince: string;
  readonly hasActiveSubscription: boolean;
}

export type DonationKind = "ONE_TIME" | "RECURRING";
export type HistoryStatus = "paid" | "failed";

export interface DonorHistoryItem {
  readonly id: string;
  readonly createdAt: string;
  readonly paidAt: string | null;
  readonly amountKopecks: string;
  readonly method: string | null;
  readonly kind: DonationKind;
  readonly status: HistoryStatus;
}

export interface DonorHistory {
  readonly year: number;
  readonly yearTotalKopecks: string;
  readonly years: readonly number[];
  readonly items: readonly DonorHistoryItem[];
  readonly nextCursor: string | null;
}

export type TaxCertificateStatus = "NEW" | "IN_PROGRESS" | "DONE";

export interface TaxCertificate {
  readonly id: string;
  readonly year: number;
  readonly status: TaxCertificateStatus;
  readonly adminComment: string | null;
  readonly createdAt: string;
  readonly doneAt: string | null;
}

export interface DeleteChallenge {
  readonly method: "email" | "fresh_login";
}

/** Тело `PATCH /donor/me`. Пустая строка — стереть поле. */
export interface UpdateProfileBody {
  readonly firstName?: string;
  readonly lastName?: string;
  readonly middleName?: string;
  readonly phone?: string;
  readonly regionSlug?: string | null;
  readonly city?: string;
  readonly showInFeed?: boolean;
}

import { LandingPageField, ReferrerField, UtmTouchDto } from '../../attribution/dto/attribution.dto';

export {
  ATTRIBUTION_URL_MAX_LENGTH,
  LANDING_PAGE_PATTERN,
  UTM_VALUE_MAX_LENGTH,
  UTM_VALUE_PATTERN,
} from '../../attribution/attribution.constants';

/**
 * Старая форма атрибуции — поле `utm` в теле доната (только first-touch).
 *
 * @deprecated Новый клиент шлёт `attribution` (`AttributionDto`). Поле `utm`
 * принимается ещё один релиз: при `forbidNonWhitelisted` его удаление сразу
 * отдало бы 400 закэшированному фронту — то есть сорвало бы донат.
 */
export class DonationUtmDto extends UtmTouchDto {
  @ReferrerField()
  referrer?: string;

  @LandingPageField()
  landingPage?: string;
}

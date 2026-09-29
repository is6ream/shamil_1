import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import { FEED_MAX_LIMIT } from '../showcase.constants';

/**
 * Длина курсора с запасом: JSON из ISO-даты и uuid в base64url — около
 * 100 символов. Без границы query-параметр становится способом прислать
 * мегабайт мусора на разбор.
 */
const MAX_CURSOR_LENGTH = 256;

/** Query `GET /donations/feed`. Лишний параметр — 400 (`forbidNonWhitelisted`). */
export class FeedQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(MAX_CURSOR_LENGTH)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(FEED_MAX_LIMIT)
  limit?: number;
}

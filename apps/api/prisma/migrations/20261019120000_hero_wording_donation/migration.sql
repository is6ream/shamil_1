-- Юридическая правка текстов (19.10.2026): слово «вклад» на сайте сбора
-- пожертвований недопустимо — это термин банковского вклада. Меняем на
-- «пожертвование» в hero, который уже лежит в базе (сиды существующий блок
-- не перетирают). Правим только старую формулировку: если текст уже
-- переписали в админке, replace() ничего не найдёт и оставит его как есть.

UPDATE "content_block"
SET "data" = jsonb_set("data", '{lede}',
      to_jsonb(replace("data"->>'lede', 'Каждый вклад — садака джария', 'Каждое пожертвование — садака джария'))),
    "updated_at" = now()
WHERE "key" = 'hero'
  AND jsonb_typeof("data"->'lede') = 'string'
  AND "data"->>'lede' LIKE '%Каждый вклад — садака джария%';

UPDATE "content_block"
SET "data" = jsonb_set("data", '{ledeShort}',
      to_jsonb(replace("data"->>'ledeShort', 'Каждый вклад — садака джария', 'Каждое пожертвование — садака джария'))),
    "updated_at" = now()
WHERE "key" = 'hero'
  AND jsonb_typeof("data"->'ledeShort') = 'string'
  AND "data"->>'ledeShort' LIKE '%Каждый вклад — садака джария%';

-- Historical payment mode cannot safely be inferred. No backfill or financial-row rewrite.
ALTER TABLE donation ADD COLUMN is_test_payment BOOLEAN;

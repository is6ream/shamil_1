CREATE TYPE "subscription_period" AS ENUM ('MONTHLY', 'FRIDAY');
ALTER TABLE "subscription" ADD COLUMN "period" "subscription_period" NOT NULL DEFAULT 'MONTHLY';

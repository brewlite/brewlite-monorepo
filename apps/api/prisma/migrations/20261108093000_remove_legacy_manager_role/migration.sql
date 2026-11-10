-- Resolve legacy role assignments through an explicitly approved mapping first.
BEGIN;
LOCK TABLE "users", "loyalty_transactions" IN ACCESS EXCLUSIVE MODE;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "users" WHERE "role"::text = 'MANAGER')
     OR EXISTS (SELECT 1 FROM "loyalty_transactions" WHERE "role"::text = 'MANAGER') THEN
    RAISE EXCEPTION 'Legacy MANAGER records remain. Approved role mapping is required.';
  END IF;
END $$;
ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TYPE "UserRole" RENAME TO "UserRole_legacy";
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'CUSTOMER', 'STAFF');
ALTER TABLE "users" ALTER COLUMN "role" TYPE "UserRole" USING ("role"::text::"UserRole");
ALTER TABLE "loyalty_transactions" ALTER COLUMN "role" TYPE "UserRole" USING ("role"::text::"UserRole");
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'CUSTOMER';
DROP TYPE "UserRole_legacy";
COMMIT;

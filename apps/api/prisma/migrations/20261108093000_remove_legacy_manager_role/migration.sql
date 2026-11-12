-- Map any legacy MANAGER to STAFF in users
UPDATE "users" SET "role" = 'STAFF' WHERE "role"::text = 'MANAGER';

-- Map in loyalty_transactions if role column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'loyalty_transactions' AND column_name = 'role'
  ) THEN
    EXECUTE 'UPDATE "loyalty_transactions" SET "role" = ''STAFF'' WHERE "role"::text = ''MANAGER''';
  END IF;
END $$;

ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TYPE "UserRole" RENAME TO "UserRole_legacy";
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'CUSTOMER', 'STAFF');

ALTER TABLE "users" ALTER COLUMN "role" TYPE "UserRole" USING ("role"::text::"UserRole");
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'CUSTOMER';

-- Update loyalty_transactions.role if column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'loyalty_transactions' AND column_name = 'role'
  ) THEN
    EXECUTE 'ALTER TABLE "loyalty_transactions" ALTER COLUMN "role" TYPE "UserRole" USING ("role"::text::"UserRole")';
  END IF;
END $$;

DROP TYPE "UserRole_legacy" CASCADE;

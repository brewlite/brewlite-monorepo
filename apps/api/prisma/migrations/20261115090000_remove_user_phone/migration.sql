-- User registration and account management use email; no runtime flow collects phone numbers.
ALTER TABLE "users" DROP COLUMN "phone";

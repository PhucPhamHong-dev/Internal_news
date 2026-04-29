ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'HR_MANAGER';

ALTER TABLE "EmployeeMaster"
  ADD COLUMN IF NOT EXISTS "canPost" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canManageEmployees" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "canPost" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canManageEmployees" BOOLEAN NOT NULL DEFAULT false;

UPDATE "EmployeeMaster"
SET "canPost" = true
WHERE "preferredRole" = 'WRITER';

UPDATE "EmployeeMaster"
SET "canManageEmployees" = true
WHERE "preferredRole" = 'HR_MANAGER';

UPDATE "User"
SET "canPost" = true
WHERE "role" = 'WRITER';

UPDATE "User"
SET "canManageEmployees" = true
WHERE "role" = 'HR_MANAGER';

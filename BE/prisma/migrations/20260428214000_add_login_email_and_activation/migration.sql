ALTER TABLE "EmployeeMaster"
ADD COLUMN "loginEmail" TEXT,
ADD COLUMN "activatedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "EmployeeMaster_loginEmail_key" ON "EmployeeMaster"("loginEmail");

UPDATE "EmployeeMaster" AS e
SET "loginEmail" = LOWER(TRIM(u."email"))
FROM "User" AS u
WHERE u."employeeId" = e."id"
  AND u."email" IS NOT NULL
  AND e."loginEmail" IS NULL;

UPDATE "EmployeeMaster" AS e
SET "activatedAt" = COALESCE(
  e."passwordChangedAt",
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM "User" AS u
      WHERE u."employeeId" = e."id"
    ) AND e."mustChangePassword" = FALSE THEN NOW()
    ELSE NULL
  END
)
WHERE e."activatedAt" IS NULL;

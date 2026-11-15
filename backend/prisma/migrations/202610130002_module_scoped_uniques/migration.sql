DROP INDEX "Student_registrationCode_key";
DROP INDEX "Student_email_key";

CREATE UNIQUE INDEX "Student_moduleId_registrationCode_key"
ON "Student"("moduleId", "registrationCode");

CREATE UNIQUE INDEX "Student_moduleId_email_key"
ON "Student"("moduleId", "email");

CREATE UNIQUE INDEX "ClassSession_moduleId_date_key"
ON "ClassSession"("moduleId", "date");

CREATE UNIQUE INDEX "AcademicModule_single_active_key"
ON "AcademicModule"("active")
WHERE "active" = true;
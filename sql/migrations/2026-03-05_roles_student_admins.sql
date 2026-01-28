IF COL_LENGTH('dbo.AdminAuthUsers', 'Role') IS NULL
BEGIN
  ALTER TABLE dbo.AdminAuthUsers
    ADD Role TINYINT NOT NULL CONSTRAINT DF_AdminAuthUsers_Role DEFAULT(2);
END

IF COL_LENGTH('dbo.AdminAuthUsers', 'SchoolId') IS NULL
BEGIN
  ALTER TABLE dbo.AdminAuthUsers
    ADD SchoolId INT NOT NULL CONSTRAINT DF_AdminAuthUsers_SchoolId DEFAULT(1);
END

IF COL_LENGTH('dbo.AdminAuthUsers', 'SchoolId') IS NOT NULL
BEGIN
  UPDATE dbo.AdminAuthUsers
  SET SchoolId = 1
  WHERE SchoolId IS NULL;
END

IF COL_LENGTH('dbo.Students', 'SchoolId') IS NULL
BEGIN
  ALTER TABLE dbo.Students
    ADD SchoolId INT NOT NULL CONSTRAINT DF_Students_SchoolId DEFAULT(1);
END

IF COL_LENGTH('dbo.Students', 'SchoolId') IS NOT NULL
BEGIN
  UPDATE dbo.Students
  SET SchoolId = 1
  WHERE SchoolId IS NULL;
END

IF OBJECT_ID('dbo.Cards', 'U') IS NOT NULL AND COL_LENGTH('dbo.Cards', 'SchoolId') IS NULL
BEGIN
  ALTER TABLE dbo.Cards
    ADD SchoolId INT NOT NULL CONSTRAINT DF_Cards_SchoolId DEFAULT(1);
END

IF OBJECT_ID('dbo.Cards', 'U') IS NOT NULL AND COL_LENGTH('dbo.Cards', 'SchoolId') IS NOT NULL
BEGIN
  UPDATE dbo.Cards
  SET SchoolId = 1
  WHERE SchoolId IS NULL;
END

IF OBJECT_ID('dbo.Cards', 'U') IS NOT NULL AND COL_LENGTH('dbo.Cards', 'CreatedByAdminId') IS NULL
BEGIN
  ALTER TABLE dbo.Cards
    ADD CreatedByAdminId INT NULL;
END

IF OBJECT_ID('dbo.Cards', 'U') IS NOT NULL
  AND OBJECT_ID('dbo.AdminAuthUsers', 'U') IS NOT NULL
  AND COL_LENGTH('dbo.Cards', 'CreatedByAdminId') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM sys.foreign_keys
    WHERE name = 'FK_Cards_CreatedByAdminId'
      AND parent_object_id = OBJECT_ID('dbo.Cards')
  )
BEGIN
  ALTER TABLE dbo.Cards
    ADD CONSTRAINT FK_Cards_CreatedByAdminId FOREIGN KEY (CreatedByAdminId)
    REFERENCES dbo.AdminAuthUsers(AdminId);
END

IF OBJECT_ID('dbo.StudentAdmins', 'U') IS NULL
BEGIN
  DECLARE @StudentIdType NVARCHAR(128);

  SELECT @StudentIdType =
    CASE
      WHEN t.name IN ('nvarchar', 'nchar') THEN t.name + '(' + CASE WHEN c.max_length = -1 THEN 'MAX' ELSE CAST(c.max_length / 2 AS NVARCHAR(10)) END + ')'
      WHEN t.name IN ('varchar', 'char') THEN t.name + '(' + CASE WHEN c.max_length = -1 THEN 'MAX' ELSE CAST(c.max_length AS NVARCHAR(10)) END + ')'
      WHEN t.name IN ('decimal', 'numeric') THEN t.name + '(' + CAST(c.precision AS NVARCHAR(10)) + ',' + CAST(c.scale AS NVARCHAR(10)) + ')'
      WHEN t.name IN ('datetime2', 'datetimeoffset', 'time') THEN t.name + '(' + CAST(c.scale AS NVARCHAR(10)) + ')'
      ELSE t.name
    END
  FROM sys.columns c
  INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
  WHERE c.object_id = OBJECT_ID('dbo.Students')
    AND c.name = 'StudentId';

  IF @StudentIdType IS NOT NULL
  BEGIN
    DECLARE @StudentAdminsSql NVARCHAR(MAX) = N'CREATE TABLE dbo.StudentAdmins (
      SchoolId INT NOT NULL,
      StudentId ' + @StudentIdType + N' NOT NULL,
      AdminId INT NOT NULL,
      Subject NVARCHAR(50) NULL,
      PermLevel TINYINT NOT NULL CONSTRAINT DF_StudentAdmins_PermLevel DEFAULT(1),
      CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_StudentAdmins_CreatedAt DEFAULT(SYSUTCDATETIME()),
      CONSTRAINT PK_StudentAdmins PRIMARY KEY (SchoolId, StudentId, AdminId)
    );';

    EXEC sp_executesql @StudentAdminsSql;
  END
END

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'IX_StudentAdmins_School_Admin'
    AND object_id = OBJECT_ID('dbo.StudentAdmins')
)
BEGIN
  CREATE INDEX IX_StudentAdmins_School_Admin ON dbo.StudentAdmins(SchoolId, AdminId);
END

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'IX_StudentAdmins_School_Student'
    AND object_id = OBJECT_ID('dbo.StudentAdmins')
)
BEGIN
  CREATE INDEX IX_StudentAdmins_School_Student ON dbo.StudentAdmins(SchoolId, StudentId);
END

IF OBJECT_ID('dbo.CardAssignments', 'U') IS NULL
BEGIN
  DECLARE @CardIdType NVARCHAR(128);
  DECLARE @CardStudentIdType NVARCHAR(128);

  SELECT @CardIdType =
    CASE
      WHEN t.name IN ('nvarchar', 'nchar') THEN t.name + '(' + CASE WHEN c.max_length = -1 THEN 'MAX' ELSE CAST(c.max_length / 2 AS NVARCHAR(10)) END + ')'
      WHEN t.name IN ('varchar', 'char') THEN t.name + '(' + CASE WHEN c.max_length = -1 THEN 'MAX' ELSE CAST(c.max_length AS NVARCHAR(10)) END + ')'
      WHEN t.name IN ('decimal', 'numeric') THEN t.name + '(' + CAST(c.precision AS NVARCHAR(10)) + ',' + CAST(c.scale AS NVARCHAR(10)) + ')'
      WHEN t.name IN ('datetime2', 'datetimeoffset', 'time') THEN t.name + '(' + CAST(c.scale AS NVARCHAR(10)) + ')'
      ELSE t.name
    END
  FROM sys.columns c
  INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
  WHERE c.object_id = OBJECT_ID('dbo.Cards')
    AND c.name = 'CardId';

  SELECT @CardStudentIdType =
    CASE
      WHEN t.name IN ('nvarchar', 'nchar') THEN t.name + '(' + CASE WHEN c.max_length = -1 THEN 'MAX' ELSE CAST(c.max_length / 2 AS NVARCHAR(10)) END + ')'
      WHEN t.name IN ('varchar', 'char') THEN t.name + '(' + CASE WHEN c.max_length = -1 THEN 'MAX' ELSE CAST(c.max_length AS NVARCHAR(10)) END + ')'
      WHEN t.name IN ('decimal', 'numeric') THEN t.name + '(' + CAST(c.precision AS NVARCHAR(10)) + ',' + CAST(c.scale AS NVARCHAR(10)) + ')'
      WHEN t.name IN ('datetime2', 'datetimeoffset', 'time') THEN t.name + '(' + CAST(c.scale AS NVARCHAR(10)) + ')'
      ELSE t.name
    END
  FROM sys.columns c
  INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
  WHERE c.object_id = OBJECT_ID('dbo.Students')
    AND c.name = 'StudentId';

  IF @CardIdType IS NOT NULL AND @CardStudentIdType IS NOT NULL
  BEGIN
    DECLARE @CardAssignmentsSql NVARCHAR(MAX) = N'CREATE TABLE dbo.CardAssignments (
      SchoolId INT NOT NULL,
      CardId ' + @CardIdType + N' NOT NULL,
      StudentId ' + @CardStudentIdType + N' NOT NULL,
      AssignedByAdminId INT NOT NULL,
      CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_CardAssignments_CreatedAt DEFAULT(SYSUTCDATETIME()),
      CONSTRAINT PK_CardAssignments PRIMARY KEY (SchoolId, CardId, StudentId)
    );';

    EXEC sp_executesql @CardAssignmentsSql;
  END
END

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'IX_CardAssignments_School_Student'
    AND object_id = OBJECT_ID('dbo.CardAssignments')
)
BEGIN
  CREATE INDEX IX_CardAssignments_School_Student ON dbo.CardAssignments(SchoolId, StudentId);
END

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'IX_CardAssignments_School_Card'
    AND object_id = OBJECT_ID('dbo.CardAssignments')
)
BEGIN
  CREATE INDEX IX_CardAssignments_School_Card ON dbo.CardAssignments(SchoolId, CardId);
END

IF OBJECT_ID('dbo.AdminAuthUsers', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.AdminAuthUsers (
    AdminId INT IDENTITY(1,1) PRIMARY KEY,
    Username NVARCHAR(64) NOT NULL,
    PasswordHash NVARCHAR(200) NOT NULL,
    IsActive BIT NOT NULL CONSTRAINT DF_AdminAuthUsers_IsActive DEFAULT(1),
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_AdminAuthUsers_CreatedAt DEFAULT(SYSUTCDATETIME()),
    FailedCount INT NOT NULL CONSTRAINT DF_AdminAuthUsers_FailedCount DEFAULT(0),
    LockoutUntil DATETIME2 NULL
  );
END

IF COL_LENGTH('dbo.AdminAuthUsers', 'Username') IS NULL
BEGIN
  ALTER TABLE dbo.AdminAuthUsers ADD Username NVARCHAR(64) NOT NULL;
END

IF COL_LENGTH('dbo.AdminAuthUsers', 'PasswordHash') IS NULL
BEGIN
  ALTER TABLE dbo.AdminAuthUsers ADD PasswordHash NVARCHAR(200) NOT NULL;
END

IF COL_LENGTH('dbo.AdminAuthUsers', 'IsActive') IS NULL
BEGIN
  ALTER TABLE dbo.AdminAuthUsers
    ADD IsActive BIT NOT NULL CONSTRAINT DF_AdminAuthUsers_IsActive DEFAULT(1);
END

IF COL_LENGTH('dbo.AdminAuthUsers', 'CreatedAt') IS NULL
BEGIN
  ALTER TABLE dbo.AdminAuthUsers
    ADD CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_AdminAuthUsers_CreatedAt DEFAULT(SYSUTCDATETIME());
END

IF COL_LENGTH('dbo.AdminAuthUsers', 'FailedCount') IS NULL
BEGIN
  ALTER TABLE dbo.AdminAuthUsers
    ADD FailedCount INT NOT NULL CONSTRAINT DF_AdminAuthUsers_FailedCount DEFAULT(0);
END

IF COL_LENGTH('dbo.AdminAuthUsers', 'LockoutUntil') IS NULL
BEGIN
  ALTER TABLE dbo.AdminAuthUsers ADD LockoutUntil DATETIME2 NULL;
END

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'UQ_AdminAuthUsers_Username'
    AND object_id = OBJECT_ID('dbo.AdminAuthUsers')
)
BEGIN
  CREATE UNIQUE INDEX UQ_AdminAuthUsers_Username ON dbo.AdminAuthUsers(Username);
END

IF OBJECT_ID('dbo.AdminAuthSessions', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.AdminAuthSessions (
    SessionId BIGINT IDENTITY(1,1) PRIMARY KEY,
    AdminId INT NOT NULL,
    TokenHash CHAR(64) NOT NULL,
    CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_AdminAuthSessions_CreatedAt DEFAULT(SYSUTCDATETIME()),
    ExpiresAt DATETIME2 NOT NULL,
    RevokedAt DATETIME2 NULL,
    CONSTRAINT FK_AdminAuthSessions_AdminId FOREIGN KEY (AdminId)
      REFERENCES dbo.AdminAuthUsers(AdminId)
  );
END

IF COL_LENGTH('dbo.AdminAuthSessions', 'AdminId') IS NULL
BEGIN
  ALTER TABLE dbo.AdminAuthSessions ADD AdminId INT NOT NULL;
END

IF COL_LENGTH('dbo.AdminAuthSessions', 'TokenHash') IS NULL
BEGIN
  ALTER TABLE dbo.AdminAuthSessions ADD TokenHash CHAR(64) NOT NULL;
END

IF COL_LENGTH('dbo.AdminAuthSessions', 'CreatedAt') IS NULL
BEGIN
  ALTER TABLE dbo.AdminAuthSessions
    ADD CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_AdminAuthSessions_CreatedAt DEFAULT(SYSUTCDATETIME());
END

IF COL_LENGTH('dbo.AdminAuthSessions', 'ExpiresAt') IS NULL
BEGIN
  ALTER TABLE dbo.AdminAuthSessions ADD ExpiresAt DATETIME2 NOT NULL;
END

IF COL_LENGTH('dbo.AdminAuthSessions', 'RevokedAt') IS NULL
BEGIN
  ALTER TABLE dbo.AdminAuthSessions ADD RevokedAt DATETIME2 NULL;
END

IF NOT EXISTS (
  SELECT 1
  FROM sys.foreign_keys
  WHERE name = 'FK_AdminAuthSessions_AdminId'
    AND parent_object_id = OBJECT_ID('dbo.AdminAuthSessions')
)
BEGIN
  ALTER TABLE dbo.AdminAuthSessions
    ADD CONSTRAINT FK_AdminAuthSessions_AdminId FOREIGN KEY (AdminId)
    REFERENCES dbo.AdminAuthUsers(AdminId);
END

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'IX_AdminAuthSessions_TokenHash'
    AND object_id = OBJECT_ID('dbo.AdminAuthSessions')
)
BEGIN
  CREATE INDEX IX_AdminAuthSessions_TokenHash ON dbo.AdminAuthSessions(TokenHash);
END

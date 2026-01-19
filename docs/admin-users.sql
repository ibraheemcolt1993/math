-- إنشاء جدول مستخدمي الإدارة (Azure SQL)
CREATE TABLE AdminUsers (
  AdminId INT IDENTITY(1,1) PRIMARY KEY,
  Username NVARCHAR(80) NOT NULL UNIQUE,
  PasswordHash NVARCHAR(128) NOT NULL,
  PasswordSalt NVARCHAR(64) NOT NULL,
  IsActive BIT NOT NULL DEFAULT 1,
  CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);

-- مثال لإنشاء مستخدم إدارة (غيّر كلمة السر قبل التنفيذ)
DECLARE @username NVARCHAR(80) = N'admin';
DECLARE @password NVARCHAR(200) = N'ChangeMe123!';
DECLARE @salt NVARCHAR(64) = CONVERT(NVARCHAR(64), NEWID());
DECLARE @hash NVARCHAR(128) =
  CONVERT(NVARCHAR(128), HASHBYTES('SHA2_256', CONCAT(@salt, N':', @password)), 2);

INSERT INTO AdminUsers (Username, PasswordHash, PasswordSalt)
VALUES (@username, @hash, @salt);

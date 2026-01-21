IF COL_LENGTH('dbo.Weeks', 'Grade') IS NULL
BEGIN
  ALTER TABLE dbo.Weeks
    ADD Grade NVARCHAR(50) NULL;
END

IF COL_LENGTH('dbo.Weeks', 'IsDeleted') IS NULL
BEGIN
  ALTER TABLE dbo.Weeks
    ADD IsDeleted BIT NOT NULL
      CONSTRAINT DF_Weeks_IsDeleted DEFAULT(0);
END

IF OBJECT_ID('dbo.WeekTargets', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.WeekTargets (
    Week INT NOT NULL,
    Class NVARCHAR(50) NOT NULL,
    CONSTRAINT PK_WeekTargets PRIMARY KEY (Week, Class),
    CONSTRAINT FK_WeekTargets_Weeks FOREIGN KEY (Week) REFERENCES dbo.Weeks(Week)
  );
END

IF OBJECT_ID('dbo.WeekTargets', 'U') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_WeekTargets_Class'
      AND object_id = OBJECT_ID('dbo.WeekTargets')
  )
BEGIN
  CREATE INDEX IX_WeekTargets_Class ON dbo.WeekTargets(Class);
END

IF OBJECT_ID('dbo.WeekTargets', 'U') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_WeekTargets_Week'
      AND object_id = OBJECT_ID('dbo.WeekTargets')
  )
BEGIN
  CREATE INDEX IX_WeekTargets_Week ON dbo.WeekTargets(Week);
END

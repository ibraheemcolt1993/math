IF COL_LENGTH('dbo.Weeks', 'Seq') IS NULL
BEGIN
  ALTER TABLE dbo.Weeks
    ADD Seq INT NULL;
END

IF COL_LENGTH('dbo.Weeks', 'PrereqWeek') IS NULL
BEGIN
  ALTER TABLE dbo.Weeks
    ADD PrereqWeek INT NULL;
END

;WITH Ranked AS (
  SELECT Week,
         ROW_NUMBER() OVER (PARTITION BY Grade ORDER BY Week) AS SeqValue
  FROM dbo.Weeks
  WHERE IsDeleted = 0
)
UPDATE w
SET Seq = r.SeqValue
FROM dbo.Weeks w
JOIN Ranked r ON w.Week = r.Week
WHERE w.Seq IS NULL OR w.Seq <> r.SeqValue;

UPDATE dbo.Weeks
SET Seq = 0
WHERE Seq IS NULL;

IF EXISTS (
  SELECT 1
  FROM sys.columns
  WHERE name = 'Seq'
    AND object_id = OBJECT_ID('dbo.Weeks')
    AND is_nullable = 1
)
BEGIN
  ALTER TABLE dbo.Weeks
    ALTER COLUMN Seq INT NOT NULL;
END

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'IX_Weeks_Grade_Seq_Active'
    AND object_id = OBJECT_ID('dbo.Weeks')
)
BEGIN
  CREATE UNIQUE INDEX IX_Weeks_Grade_Seq_Active
    ON dbo.Weeks (Grade, Seq)
    WHERE IsDeleted = 0;
END

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'IX_Weeks_PrereqWeek'
    AND object_id = OBJECT_ID('dbo.Weeks')
)
BEGIN
  CREATE INDEX IX_Weeks_PrereqWeek
    ON dbo.Weeks (PrereqWeek);
END

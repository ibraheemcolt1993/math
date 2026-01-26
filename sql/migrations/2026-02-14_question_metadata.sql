IF COL_LENGTH('dbo.FlowItems', 'IsRequired') IS NULL
BEGIN
  ALTER TABLE dbo.FlowItems
  ADD IsRequired BIT NOT NULL CONSTRAINT DF_FlowItems_IsRequired DEFAULT (1);
END

IF COL_LENGTH('dbo.FlowItems', 'DataJson') IS NULL
BEGIN
  ALTER TABLE dbo.FlowItems
  ADD DataJson NVARCHAR(MAX) NULL;
END

IF COL_LENGTH('dbo.FlowItems', 'ValidationJson') IS NULL
BEGIN
  ALTER TABLE dbo.FlowItems
  ADD ValidationJson NVARCHAR(MAX) NULL;
END

IF COL_LENGTH('dbo.AssessmentQuestions', 'IsRequired') IS NULL
BEGIN
  ALTER TABLE dbo.AssessmentQuestions
  ADD IsRequired BIT NOT NULL CONSTRAINT DF_AssessmentQuestions_IsRequired DEFAULT (1);
END

IF COL_LENGTH('dbo.AssessmentQuestions', 'DataJson') IS NULL
BEGIN
  ALTER TABLE dbo.AssessmentQuestions
  ADD DataJson NVARCHAR(MAX) NULL;
END

IF COL_LENGTH('dbo.AssessmentQuestions', 'ValidationJson') IS NULL
BEGIN
  ALTER TABLE dbo.AssessmentQuestions
  ADD ValidationJson NVARCHAR(MAX) NULL;
END

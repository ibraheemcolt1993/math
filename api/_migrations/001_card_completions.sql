IF OBJECT_ID('dbo.CardCompletions', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.CardCompletions (
    CompletionId INT IDENTITY(1,1) PRIMARY KEY,
    StudentId NVARCHAR(20) NOT NULL,
    Week INT NOT NULL,
    FinalScore INT NOT NULL,
    CompletedAt DATETIME NOT NULL DEFAULT GETDATE(),
    CONSTRAINT FK_CardCompletions_Students FOREIGN KEY (StudentId)
      REFERENCES dbo.Students(StudentId),
    CONSTRAINT FK_CardCompletions_Weeks FOREIGN KEY (Week)
      REFERENCES dbo.Weeks(Week),
    CONSTRAINT UQ_CardCompletions_StudentWeek UNIQUE (StudentId, Week)
  );

  CREATE INDEX IX_CardCompletions_Week ON dbo.CardCompletions (Week);
  CREATE INDEX IX_CardCompletions_StudentId ON dbo.CardCompletions (StudentId);
END

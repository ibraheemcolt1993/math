const express = require('express');
const cors = require('cors');
const { getPool, sql } = require('./db');

const app = express();

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }
      if (!allowedOrigins.length || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    }
  })
);

app.use(express.json());

app.get('/api/health', async (req, res, next) => {
  try {
    const pool = await getPool();
    await pool.request().query('SELECT 1 AS ok');
    res.json({ ok: true, db: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/weeks', async (req, res, next) => {
  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .query('SELECT Week, Title FROM Weeks ORDER BY Week');
    res.json(result.recordset);
  } catch (error) {
    next(error);
  }
});

app.get('/api/cards', async (req, res, next) => {
  try {
    const pool = await getPool();
    const result = await pool
      .request()
      .query('SELECT Week, Title, PrereqWeek FROM Cards ORDER BY Week');
    res.json(result.recordset);
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/cards/:week/link', async (req, res, next) => {
  try {
    const week = Number(req.params.week);
    if (!Number.isInteger(week)) {
      return res.status(400).json({ ok: false, error: 'Invalid week parameter.' });
    }

    const url = String(req.body?.url || '').trim();
    if (!url) {
      return res.status(400).json({ ok: false, error: 'Missing url.' });
    }

    const pool = await getPool();
    const columnCheck = await pool
      .request()
      .query("SELECT COL_LENGTH('Cards', 'CardUrl') AS CardUrlLength");

    if (!columnCheck.recordset?.[0]?.CardUrlLength) {
      await pool.request().query('ALTER TABLE Cards ADD CardUrl NVARCHAR(2048) NULL');
    }

    const updateResult = await pool
      .request()
      .input('week', sql.Int, week)
      .input('url', sql.NVarChar(2048), url)
      .query('UPDATE Cards SET CardUrl = @url WHERE Week = @week');

    if (!updateResult.rowsAffected?.[0]) {
      return res.status(404).json({ ok: false, error: 'Card not found.' });
    }

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/weeks/:week', async (req, res, next) => {
  try {
    const week = Number(req.params.week);
    if (!Number.isInteger(week)) {
      return res.status(400).json({ ok: false, error: 'Invalid week parameter.' });
    }

    const pool = await getPool();
    const weekResult = await pool
      .request()
      .input('week', sql.Int, week)
      .query('SELECT Week, Title FROM Weeks WHERE Week = @week');

    if (!weekResult.recordset.length) {
      return res.status(404).json({ ok: false, error: 'Week not found.' });
    }

    const goalsResult = await pool
      .request()
      .input('week', sql.Int, week)
      .query(
        'SELECT GoalId, Week, SortOrder, GoalText FROM WeekGoals WHERE Week = @week ORDER BY SortOrder'
      );

    const prereqResult = await pool
      .request()
      .input('week', sql.Int, week)
      .query(
        'SELECT PrerequisiteId, Week, SortOrder, PrerequisiteText FROM WeekPrerequisites WHERE Week = @week ORDER BY SortOrder'
      );

    const conceptResult = await pool
      .request()
      .input('week', sql.Int, week)
      .query(
        'SELECT ConceptId, Week, SortOrder, Title FROM Concepts WHERE Week = @week ORDER BY SortOrder'
      );

    const conceptIds = conceptResult.recordset.map((concept) => concept.ConceptId);
    let flowItemsResult = { recordset: [] };
    let flowDetailsResult = { recordset: [] };
    let flowHintsResult = { recordset: [] };
    let flowChoicesResult = { recordset: [] };

    if (conceptIds.length) {
      const inClause = conceptIds.map((_, index) => `@concept${index}`).join(',');
      const flowRequest = pool.request();
      conceptIds.forEach((id, index) => {
        flowRequest.input(`concept${index}`, sql.Int, id);
      });

      flowItemsResult = await flowRequest.query(
        `SELECT FlowItemId, ConceptId, SortOrder, ItemType, ItemText, ItemTitle, ItemDescription, ItemUrl, Answer, CorrectIndex, Solution
         FROM FlowItems
         WHERE ConceptId IN (${inClause})
         ORDER BY ConceptId, SortOrder`
      );

      const flowItemIds = flowItemsResult.recordset.map((item) => item.FlowItemId);
      if (flowItemIds.length) {
        const itemClause = flowItemIds.map((_, index) => `@item${index}`).join(',');
        const itemRequest = pool.request();
        flowItemIds.forEach((id, index) => {
          itemRequest.input(`item${index}`, sql.Int, id);
        });

        flowDetailsResult = await itemRequest.query(
          `SELECT FlowItemDetailId, FlowItemId, SortOrder, DetailText
           FROM FlowItemDetails
           WHERE FlowItemId IN (${itemClause})
           ORDER BY FlowItemId, SortOrder`
        );

        const hintRequest = pool.request();
        flowItemIds.forEach((id, index) => {
          hintRequest.input(`item${index}`, sql.Int, id);
        });
        flowHintsResult = await hintRequest.query(
          `SELECT FlowItemHintId, FlowItemId, SortOrder, HintText
           FROM FlowItemHints
           WHERE FlowItemId IN (${itemClause})
           ORDER BY FlowItemId, SortOrder`
        );

        const choiceRequest = pool.request();
        flowItemIds.forEach((id, index) => {
          choiceRequest.input(`item${index}`, sql.Int, id);
        });
        flowChoicesResult = await choiceRequest.query(
          `SELECT FlowItemChoiceId, FlowItemId, SortOrder, ChoiceText
           FROM FlowItemChoices
           WHERE FlowItemId IN (${itemClause})
           ORDER BY FlowItemId, SortOrder`
        );
      }
    }

    const assessmentsResult = await pool
      .request()
      .input('week', sql.Int, week)
      .query(
        'SELECT AssessmentId, Week, Title, Description FROM Assessments WHERE Week = @week ORDER BY AssessmentId'
      );

    const assessmentIds = assessmentsResult.recordset.map(
      (assessment) => assessment.AssessmentId
    );
    let assessmentQuestionsResult = { recordset: [] };
    let assessmentChoicesResult = { recordset: [] };

    if (assessmentIds.length) {
      const assessmentClause = assessmentIds.map((_, index) => `@assessment${index}`).join(',');
      const assessmentRequest = pool.request();
      assessmentIds.forEach((id, index) => {
        assessmentRequest.input(`assessment${index}`, sql.Int, id);
      });

      assessmentQuestionsResult = await assessmentRequest.query(
        `SELECT AssessmentQuestionId, AssessmentId, SortOrder, QuestionType, QuestionText, Answer, Points, CorrectIndex
         FROM AssessmentQuestions
         WHERE AssessmentId IN (${assessmentClause})
         ORDER BY AssessmentId, SortOrder`
      );

      const questionIds = assessmentQuestionsResult.recordset.map(
        (question) => question.AssessmentQuestionId
      );

      if (questionIds.length) {
        const questionClause = questionIds.map((_, index) => `@question${index}`).join(',');
        const questionRequest = pool.request();
        questionIds.forEach((id, index) => {
          questionRequest.input(`question${index}`, sql.Int, id);
        });

        assessmentChoicesResult = await questionRequest.query(
          `SELECT AssessmentChoiceId, AssessmentQuestionId, SortOrder, ChoiceText
           FROM AssessmentQuestionChoices
           WHERE AssessmentQuestionId IN (${questionClause})
           ORDER BY AssessmentQuestionId, SortOrder`
        );
      }
    }

    const detailsByItem = new Map();
    flowDetailsResult.recordset.forEach((detail) => {
      if (!detailsByItem.has(detail.FlowItemId)) {
        detailsByItem.set(detail.FlowItemId, []);
      }
      detailsByItem.get(detail.FlowItemId).push(detail);
    });

    const hintsByItem = new Map();
    flowHintsResult.recordset.forEach((hint) => {
      if (!hintsByItem.has(hint.FlowItemId)) {
        hintsByItem.set(hint.FlowItemId, []);
      }
      hintsByItem.get(hint.FlowItemId).push(hint);
    });

    const choicesByItem = new Map();
    flowChoicesResult.recordset.forEach((choice) => {
      if (!choicesByItem.has(choice.FlowItemId)) {
        choicesByItem.set(choice.FlowItemId, []);
      }
      choicesByItem.get(choice.FlowItemId).push(choice);
    });

    const flowItemsByConcept = new Map();
    flowItemsResult.recordset.forEach((item) => {
      if (!flowItemsByConcept.has(item.ConceptId)) {
        flowItemsByConcept.set(item.ConceptId, []);
      }
      flowItemsByConcept.get(item.ConceptId).push({
        item,
        details: detailsByItem.get(item.FlowItemId) || [],
        hints: hintsByItem.get(item.FlowItemId) || [],
        choices: choicesByItem.get(item.FlowItemId) || []
      });
    });

    const concepts = conceptResult.recordset.map((concept) => ({
      concept,
      flow: flowItemsByConcept.get(concept.ConceptId) || []
    }));

    const choicesByQuestion = new Map();
    assessmentChoicesResult.recordset.forEach((choice) => {
      if (!choicesByQuestion.has(choice.AssessmentQuestionId)) {
        choicesByQuestion.set(choice.AssessmentQuestionId, []);
      }
      choicesByQuestion.get(choice.AssessmentQuestionId).push(choice);
    });

    const questionsByAssessment = new Map();
    assessmentQuestionsResult.recordset.forEach((question) => {
      if (!questionsByAssessment.has(question.AssessmentId)) {
        questionsByAssessment.set(question.AssessmentId, []);
      }
      questionsByAssessment.get(question.AssessmentId).push({
        question,
        choices: choicesByQuestion.get(question.AssessmentQuestionId) || []
      });
    });

    const assessments = assessmentsResult.recordset.map((assessment) => ({
      assessment,
      questions: questionsByAssessment.get(assessment.AssessmentId) || []
    }));

    res.json({
      week: weekResult.recordset[0],
      goals: goalsResult.recordset,
      prerequisites: prereqResult.recordset,
      concepts,
      assessments
    });
  } catch (error) {
    next(error);
  }
});

app.use((req, res) => {
  res.status(404).json({ ok: false, error: 'Not found.' });
});

app.use((err, req, res, next) => {
  const status = err.status || 500;
  res.status(status).json({
    ok: false,
    error: err.message || 'Internal server error.'
  });
});

module.exports = app;

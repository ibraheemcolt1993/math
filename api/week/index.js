const { getPool, sql } = require('../_shared/db');
const { readJson } = require('../_shared/parse');
const { DEFAULT_HEADERS } = require('../_shared/http');

module.exports = async function (context, req) {
  try {
    const weekParam = Number(req.params.week);
    if (!Number.isInteger(weekParam)) {
      context.res = {
        status: 400,
        headers: DEFAULT_HEADERS,
        body: { ok: false, error: 'Invalid week parameter.' }
      };
      return;
    }

    const dbPool = await getPool();

    if (req.method === 'PUT') {
      const payload = readJson(req);
      if (!payload) {
        context.res = {
          status: 400,
          headers: DEFAULT_HEADERS,
          body: { ok: false, error: 'Invalid JSON body.' }
        };
        return;
      }

      const title = String(payload.title || '').trim();
      const prereq =
        payload.prereq == null || payload.prereq === '' ? null : Number(payload.prereq);

      if (!title) {
        context.res = {
          status: 400,
          headers: DEFAULT_HEADERS,
          body: { ok: false, error: 'title is required.' }
        };
        return;
      }

      if (prereq != null && !Number.isInteger(prereq)) {
        context.res = {
          status: 400,
          headers: DEFAULT_HEADERS,
          body: { ok: false, error: 'prereq must be an integer.' }
        };
        return;
      }

      const goals = Array.isArray(payload.goals) ? payload.goals : [];
      const prerequisites = Array.isArray(payload.prerequisites) ? payload.prerequisites : [];
      const concepts = Array.isArray(payload.concepts) ? payload.concepts : [];
      const assessment = payload.assessment && typeof payload.assessment === 'object'
        ? payload.assessment
        : null;

      const transaction = new sql.Transaction(dbPool);
      await transaction.begin();

      try {
        const upsertWeekRequest = new sql.Request(transaction);
        const updateWeekResult = await upsertWeekRequest
          .input('week', sql.Int, weekParam)
          .input('title', sql.NVarChar(300), title)
          .query(
            `UPDATE dbo.Weeks
             SET Title = @title
             WHERE Week = @week`
          );

        if (!updateWeekResult.rowsAffected?.[0]) {
          await upsertWeekRequest.query(
            `INSERT INTO dbo.Weeks (Week, Title)
             VALUES (@week, @title)`
          );
        }

        const upsertCardRequest = new sql.Request(transaction);
        const updateCardResult = await upsertCardRequest
          .input('week', sql.Int, weekParam)
          .input('title', sql.NVarChar(300), title)
          .input('prereq', sql.Int, prereq)
          .query(
            `UPDATE dbo.Cards
             SET Title = @title, PrereqWeek = @prereq
             WHERE Week = @week`
          );

        if (!updateCardResult.rowsAffected?.[0]) {
          await upsertCardRequest.query(
            `INSERT INTO dbo.Cards (Week, Title, PrereqWeek)
             VALUES (@week, @title, @prereq)`
          );
        }

        await new sql.Request(transaction)
          .input('week', sql.Int, weekParam)
          .query(
            `DELETE FROM dbo.FlowItemDetails
             WHERE FlowItemId IN (
               SELECT FlowItemId FROM dbo.FlowItems
               WHERE ConceptId IN (SELECT ConceptId FROM dbo.Concepts WHERE Week = @week)
             );
             DELETE FROM dbo.FlowItemHints
             WHERE FlowItemId IN (
               SELECT FlowItemId FROM dbo.FlowItems
               WHERE ConceptId IN (SELECT ConceptId FROM dbo.Concepts WHERE Week = @week)
             );
             DELETE FROM dbo.FlowItemChoices
             WHERE FlowItemId IN (
               SELECT FlowItemId FROM dbo.FlowItems
               WHERE ConceptId IN (SELECT ConceptId FROM dbo.Concepts WHERE Week = @week)
             );
             DELETE FROM dbo.FlowItems
             WHERE ConceptId IN (SELECT ConceptId FROM dbo.Concepts WHERE Week = @week);
             DELETE FROM dbo.Concepts WHERE Week = @week;
             DELETE FROM dbo.AssessmentQuestionChoices
             WHERE AssessmentQuestionId IN (
               SELECT AssessmentQuestionId FROM dbo.AssessmentQuestions
               WHERE AssessmentId IN (SELECT AssessmentId FROM dbo.Assessments WHERE Week = @week)
             );
             DELETE FROM dbo.AssessmentQuestions
             WHERE AssessmentId IN (SELECT AssessmentId FROM dbo.Assessments WHERE Week = @week);
             DELETE FROM dbo.Assessments WHERE Week = @week;
             DELETE FROM dbo.WeekGoals WHERE Week = @week;
             DELETE FROM dbo.WeekPrerequisites WHERE Week = @week;`
          );

        for (let index = 0; index < goals.length; index += 1) {
          const goalText = String(goals[index] || '').trim();
          if (!goalText) continue;
          await new sql.Request(transaction)
            .input('week', sql.Int, weekParam)
            .input('sortOrder', sql.Int, index)
            .input('goalText', sql.NVarChar(500), goalText)
            .query(
              `INSERT INTO dbo.WeekGoals (Week, SortOrder, GoalText)
               VALUES (@week, @sortOrder, @goalText)`
            );
        }

        for (let index = 0; index < prerequisites.length; index += 1) {
          const prereqText = String(prerequisites[index] || '').trim();
          if (!prereqText) continue;
          await new sql.Request(transaction)
            .input('week', sql.Int, weekParam)
            .input('sortOrder', sql.Int, index)
            .input('prereqText', sql.NVarChar(500), prereqText)
            .query(
              `INSERT INTO dbo.WeekPrerequisites (Week, SortOrder, PrerequisiteText)
               VALUES (@week, @sortOrder, @prereqText)`
            );
        }

        for (let conceptIndex = 0; conceptIndex < concepts.length; conceptIndex += 1) {
          const concept = concepts[conceptIndex] || {};
          const conceptTitle = String(concept.title || '').trim() || `مفهوم ${conceptIndex + 1}`;
          const flow = Array.isArray(concept.flow) ? concept.flow : [];

          const conceptResult = await new sql.Request(transaction)
            .input('week', sql.Int, weekParam)
            .input('sortOrder', sql.Int, conceptIndex)
            .input('title', sql.NVarChar(300), conceptTitle)
            .query(
              `INSERT INTO dbo.Concepts (Week, SortOrder, Title)
               OUTPUT INSERTED.ConceptId
               VALUES (@week, @sortOrder, @title)`
            );

          const conceptId = conceptResult.recordset[0]?.ConceptId;
          if (!conceptId) continue;

          for (let itemIndex = 0; itemIndex < flow.length; itemIndex += 1) {
            const item = flow[itemIndex] || {};
            const itemType = String(item.type || 'note').trim().toLowerCase();

            const flowResult = await new sql.Request(transaction)
              .input('conceptId', sql.Int, conceptId)
              .input('sortOrder', sql.Int, itemIndex)
              .input('itemType', sql.NVarChar(50), itemType)
              .input('itemText', sql.NVarChar(sql.MAX), item.text ?? null)
              .input('itemTitle', sql.NVarChar(300), item.title ?? null)
              .input('itemDescription', sql.NVarChar(sql.MAX), item.description ?? null)
              .input('itemUrl', sql.NVarChar(500), item.url ?? null)
              .input('answer', sql.NVarChar(sql.MAX), item.answer ?? null)
              .input('correctIndex', sql.Int, item.correctIndex ?? null)
              .input('solution', sql.NVarChar(sql.MAX), item.solution ?? null)
              .query(
                `INSERT INTO dbo.FlowItems (
                   ConceptId, SortOrder, ItemType, ItemText, ItemTitle,
                   ItemDescription, ItemUrl, Answer, CorrectIndex, Solution
                 )
                 OUTPUT INSERTED.FlowItemId
                 VALUES (
                   @conceptId, @sortOrder, @itemType, @itemText, @itemTitle,
                   @itemDescription, @itemUrl, @answer, @correctIndex, @solution
                 )`
              );

            const flowItemId = flowResult.recordset[0]?.FlowItemId;
            if (!flowItemId) continue;

            const details = Array.isArray(item.details) ? item.details : [];
            for (let detailIndex = 0; detailIndex < details.length; detailIndex += 1) {
              const detailText = String(details[detailIndex] || '').trim();
              if (!detailText) continue;
              await new sql.Request(transaction)
                .input('flowItemId', sql.Int, flowItemId)
                .input('sortOrder', sql.Int, detailIndex)
                .input('detailText', sql.NVarChar(sql.MAX), detailText)
                .query(
                  `INSERT INTO dbo.FlowItemDetails (FlowItemId, SortOrder, DetailText)
                   VALUES (@flowItemId, @sortOrder, @detailText)`
                );
            }

            const hints = Array.isArray(item.hints) ? item.hints : [];
            for (let hintIndex = 0; hintIndex < hints.length; hintIndex += 1) {
              const hintText = String(hints[hintIndex] || '').trim();
              if (!hintText) continue;
              await new sql.Request(transaction)
                .input('flowItemId', sql.Int, flowItemId)
                .input('sortOrder', sql.Int, hintIndex)
                .input('hintText', sql.NVarChar(sql.MAX), hintText)
                .query(
                  `INSERT INTO dbo.FlowItemHints (FlowItemId, SortOrder, HintText)
                   VALUES (@flowItemId, @sortOrder, @hintText)`
                );
            }

            const choices = Array.isArray(item.choices) ? item.choices : [];
            for (let choiceIndex = 0; choiceIndex < choices.length; choiceIndex += 1) {
              const choiceText = String(choices[choiceIndex] || '').trim();
              if (!choiceText) continue;
              await new sql.Request(transaction)
                .input('flowItemId', sql.Int, flowItemId)
                .input('sortOrder', sql.Int, choiceIndex)
                .input('choiceText', sql.NVarChar(500), choiceText)
                .query(
                  `INSERT INTO dbo.FlowItemChoices (FlowItemId, SortOrder, ChoiceText)
                   VALUES (@flowItemId, @sortOrder, @choiceText)`
                );
            }
          }
        }

        if (assessment && Array.isArray(assessment.questions) && assessment.questions.length) {
          const assessmentResult = await new sql.Request(transaction)
            .input('week', sql.Int, weekParam)
            .input('title', sql.NVarChar(300), String(assessment.title || '').trim())
            .input('description', sql.NVarChar(sql.MAX), String(assessment.description || '').trim())
            .query(
              `INSERT INTO dbo.Assessments (Week, Title, Description)
               OUTPUT INSERTED.AssessmentId
               VALUES (@week, @title, @description)`
            );

          const assessmentId = assessmentResult.recordset[0]?.AssessmentId;
          if (assessmentId) {
            for (let questionIndex = 0; questionIndex < assessment.questions.length; questionIndex += 1) {
              const question = assessment.questions[questionIndex] || {};
              const questionType = String(question.type || 'input').trim().toLowerCase();
              const questionText = String(question.text || '').trim();
              const questionPoints = Number.isFinite(question.points) ? Number(question.points) : 1;
              const answer = questionType === 'mcq' ? null : String(question.answer ?? '').trim();
              const correctIndex =
                questionType === 'mcq' && Number.isFinite(question.correctIndex)
                  ? Number(question.correctIndex)
                  : null;

              const questionResult = await new sql.Request(transaction)
                .input('assessmentId', sql.Int, assessmentId)
                .input('sortOrder', sql.Int, questionIndex)
                .input('questionType', sql.NVarChar(50), questionType)
                .input('questionText', sql.NVarChar(sql.MAX), questionText)
                .input('answer', sql.NVarChar(sql.MAX), answer)
                .input('points', sql.Int, questionPoints)
                .input('correctIndex', sql.Int, correctIndex)
                .query(
                  `INSERT INTO dbo.AssessmentQuestions (
                     AssessmentId, SortOrder, QuestionType, QuestionText, Answer, Points, CorrectIndex
                   )
                   OUTPUT INSERTED.AssessmentQuestionId
                   VALUES (
                     @assessmentId, @sortOrder, @questionType, @questionText, @answer, @points, @correctIndex
                   )`
                );

              const assessmentQuestionId = questionResult.recordset[0]?.AssessmentQuestionId;
              if (assessmentQuestionId && Array.isArray(question.choices)) {
                for (let choiceIndex = 0; choiceIndex < question.choices.length; choiceIndex += 1) {
                  const choiceText = String(question.choices[choiceIndex] || '').trim();
                  if (!choiceText) continue;
                  await new sql.Request(transaction)
                    .input('assessmentQuestionId', sql.Int, assessmentQuestionId)
                    .input('sortOrder', sql.Int, choiceIndex)
                    .input('choiceText', sql.NVarChar(500), choiceText)
                    .query(
                      `INSERT INTO dbo.AssessmentQuestionChoices (AssessmentQuestionId, SortOrder, ChoiceText)
                       VALUES (@assessmentQuestionId, @sortOrder, @choiceText)`
                    );
                }
              }
            }
          }
        }

        await transaction.commit();
      } catch (error) {
        await transaction.rollback();
        throw error;
      }

      context.res = {
        status: 200,
        headers: DEFAULT_HEADERS,
        body: { ok: true }
      };
      return;
    }

    if (req.method !== 'GET') {
      context.res = {
        status: 405,
        headers: DEFAULT_HEADERS,
        body: { ok: false, error: 'Method not allowed.' }
      };
      return;
    }

    const weekResult = await dbPool
      .request()
      .input('week', sql.Int, weekParam)
      .query('SELECT Week, Title FROM dbo.Weeks WHERE Week = @week');

    if (!weekResult.recordset.length) {
      context.res = {
        status: 404,
        headers: DEFAULT_HEADERS,
        body: { ok: false, error: 'Week not found.' }
      };
      return;
    }

    const goalsResult = await dbPool
      .request()
      .input('week', sql.Int, weekParam)
      .query(
        'SELECT GoalId, Week, SortOrder, GoalText FROM dbo.WeekGoals WHERE Week = @week ORDER BY SortOrder'
      );

    const prerequisitesResult = await dbPool
      .request()
      .input('week', sql.Int, weekParam)
      .query(
        'SELECT PrerequisiteId, Week, SortOrder, PrerequisiteText FROM dbo.WeekPrerequisites WHERE Week = @week ORDER BY SortOrder'
      );

    const conceptsResult = await dbPool
      .request()
      .input('week', sql.Int, weekParam)
      .query('SELECT ConceptId, Week, SortOrder, Title FROM dbo.Concepts WHERE Week = @week ORDER BY SortOrder');

    const conceptIds = conceptsResult.recordset.map((concept) => concept.ConceptId);
    let flowItemsResult = { recordset: [] };
    let flowDetailsResult = { recordset: [] };
    let flowHintsResult = { recordset: [] };
    let flowChoicesResult = { recordset: [] };

    if (conceptIds.length) {
      const inClause = conceptIds.map((_, index) => `@concept${index}`).join(',');
      const flowRequest = dbPool.request();
      conceptIds.forEach((id, index) => {
        flowRequest.input(`concept${index}`, sql.Int, id);
      });

      flowItemsResult = await flowRequest.query(
        `SELECT FlowItemId, ConceptId, SortOrder, ItemType, ItemText, ItemTitle, ItemDescription, ItemUrl, Answer, CorrectIndex, Solution
         FROM dbo.FlowItems
         WHERE ConceptId IN (${inClause})
         ORDER BY ConceptId, SortOrder`
      );

      const flowItemIds = flowItemsResult.recordset.map((item) => item.FlowItemId);
      if (flowItemIds.length) {
        const itemClause = flowItemIds.map((_, index) => `@item${index}`).join(',');
        const detailRequest = dbPool.request();
        flowItemIds.forEach((id, index) => {
          detailRequest.input(`item${index}`, sql.Int, id);
        });

        flowDetailsResult = await detailRequest.query(
          `SELECT FlowItemDetailId, FlowItemId, SortOrder, DetailText
           FROM dbo.FlowItemDetails
           WHERE FlowItemId IN (${itemClause})
           ORDER BY FlowItemId, SortOrder`
        );

        const hintRequest = dbPool.request();
        flowItemIds.forEach((id, index) => {
          hintRequest.input(`item${index}`, sql.Int, id);
        });

        flowHintsResult = await hintRequest.query(
          `SELECT FlowItemHintId, FlowItemId, SortOrder, HintText
           FROM dbo.FlowItemHints
           WHERE FlowItemId IN (${itemClause})
           ORDER BY FlowItemId, SortOrder`
        );

        const choiceRequest = dbPool.request();
        flowItemIds.forEach((id, index) => {
          choiceRequest.input(`item${index}`, sql.Int, id);
        });

        flowChoicesResult = await choiceRequest.query(
          `SELECT FlowItemChoiceId, FlowItemId, SortOrder, ChoiceText
           FROM dbo.FlowItemChoices
           WHERE FlowItemId IN (${itemClause})
           ORDER BY FlowItemId, SortOrder`
        );
      }
    }

    const assessmentsResult = await dbPool
      .request()
      .input('week', sql.Int, weekParam)
      .query(
        'SELECT AssessmentId, Week, Title, Description FROM dbo.Assessments WHERE Week = @week ORDER BY AssessmentId'
      );

    const assessmentIds = assessmentsResult.recordset.map(
      (assessment) => assessment.AssessmentId
    );
    let assessmentQuestionsResult = { recordset: [] };
    let assessmentChoicesResult = { recordset: [] };

    if (assessmentIds.length) {
      const assessmentClause = assessmentIds.map((_, index) => `@assessment${index}`).join(',');
      const assessmentRequest = dbPool.request();
      assessmentIds.forEach((id, index) => {
        assessmentRequest.input(`assessment${index}`, sql.Int, id);
      });

      assessmentQuestionsResult = await assessmentRequest.query(
        `SELECT AssessmentQuestionId, AssessmentId, SortOrder, QuestionType, QuestionText, Answer, Points, CorrectIndex
         FROM dbo.AssessmentQuestions
         WHERE AssessmentId IN (${assessmentClause})
         ORDER BY AssessmentId, SortOrder`
      );

      const questionIds = assessmentQuestionsResult.recordset.map(
        (question) => question.AssessmentQuestionId
      );

      if (questionIds.length) {
        const questionClause = questionIds.map((_, index) => `@question${index}`).join(',');
        const questionRequest = dbPool.request();
        questionIds.forEach((id, index) => {
          questionRequest.input(`question${index}`, sql.Int, id);
        });

        assessmentChoicesResult = await questionRequest.query(
          `SELECT AssessmentChoiceId, AssessmentQuestionId, SortOrder, ChoiceText
           FROM dbo.AssessmentQuestionChoices
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

    const concepts = conceptsResult.recordset.map((concept) => ({
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

    const weekData = weekResult.recordset[0];
    const goals = goalsResult.recordset.map((goal) => goal.GoalText);
    const prerequisites = prerequisitesResult.recordset.map(
      (prereq) => prereq.PrerequisiteText
    );

    const normalizedConcepts = concepts.map(({ concept, flow }) => ({
      title: concept.Title,
      flow: flow.map(({ item, details, hints, choices }) => {
        const type = String(item.ItemType || '').trim().toLowerCase();
        const mapped = {
          type,
          text: item.ItemText,
          title: item.ItemTitle,
          description: item.ItemDescription,
          url: item.ItemUrl,
          answer: item.Answer,
          correctIndex: item.CorrectIndex,
          solution: item.Solution,
          details: details.map((detail) => detail.DetailText),
          hints: hints.map((hint) => hint.HintText),
          choices: choices.map((choice) => choice.ChoiceText)
        };

        if (!mapped.details.length) delete mapped.details;
        if (!mapped.hints.length) delete mapped.hints;
        if (!mapped.choices.length) delete mapped.choices;

        return mapped;
      })
    }));

    const normalizedAssessments = assessments.map(({ assessment, questions }) => ({
      title: assessment.Title,
      description: assessment.Description,
      questions: questions.map(({ question, choices }) => {
        const rawType = String(question.QuestionType || '').trim().toLowerCase();
        const choiceTexts = choices.map((choice) => choice.ChoiceText);
        let type = rawType;
        if (!['mcq', 'input'].includes(type)) {
          type = choiceTexts.length ? 'mcq' : 'input';
        }

        const normalized = {
          type,
          text: question.QuestionText,
          points: Number.isFinite(question.Points) ? question.Points : 1
        };

        if (type === 'mcq') {
          normalized.choices = choiceTexts;
          normalized.correctIndex =
            typeof question.CorrectIndex === 'number' ? question.CorrectIndex : 0;
        } else {
          normalized.answer = question.Answer ?? '';
        }

        return normalized;
      })
    }));

    context.res = {
      status: 200,
      headers: DEFAULT_HEADERS,
      body: {
        week: weekData.Week,
        title: weekData.Title,
        goals,
        prerequisites,
        concepts: normalizedConcepts,
        assessment: normalizedAssessments[0] || null
      }
    };
  } catch (error) {
    context.res = {
      status: 500,
      headers: DEFAULT_HEADERS,
      body: { ok: false, error: error.message }
    };
  }
};

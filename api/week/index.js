const { getPool, sql } = require('../_shared/db');

module.exports = async function (context, req) {
  try {
    const weekParam = Number(req.params.week);
    if (!Number.isInteger(weekParam)) {
      context.res = {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: { ok: false, error: 'Invalid week parameter.' }
      };
      return;
    }

    const dbPool = await getPool();
    const weekResult = await dbPool
      .request()
      .input('week', sql.Int, weekParam)
      .query('SELECT Week, Title FROM Weeks WHERE Week = @week');

    if (!weekResult.recordset.length) {
      context.res = {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
        body: { ok: false, error: 'Week not found.' }
      };
      return;
    }

    const goalsResult = await dbPool
      .request()
      .input('week', sql.Int, weekParam)
      .query(
        'SELECT GoalId, Week, SortOrder, GoalText FROM WeekGoals WHERE Week = @week ORDER BY SortOrder'
      );

    const prerequisitesResult = await dbPool
      .request()
      .input('week', sql.Int, weekParam)
      .query(
        'SELECT PrerequisiteId, Week, SortOrder, PrerequisiteText FROM WeekPrerequisites WHERE Week = @week ORDER BY SortOrder'
      );

    const conceptsResult = await dbPool
      .request()
      .input('week', sql.Int, weekParam)
      .query('SELECT ConceptId, Week, SortOrder, Title FROM Concepts WHERE Week = @week ORDER BY SortOrder');

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
         FROM FlowItems
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
           FROM FlowItemDetails
           WHERE FlowItemId IN (${itemClause})
           ORDER BY FlowItemId, SortOrder`
        );

        const hintRequest = dbPool.request();
        flowItemIds.forEach((id, index) => {
          hintRequest.input(`item${index}`, sql.Int, id);
        });

        flowHintsResult = await hintRequest.query(
          `SELECT FlowItemHintId, FlowItemId, SortOrder, HintText
           FROM FlowItemHints
           WHERE FlowItemId IN (${itemClause})
           ORDER BY FlowItemId, SortOrder`
        );

        const choiceRequest = dbPool.request();
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

    const assessmentsResult = await dbPool
      .request()
      .input('week', sql.Int, weekParam)
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
      const assessmentRequest = dbPool.request();
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
        const questionRequest = dbPool.request();
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
      headers: { 'Content-Type': 'application/json' },
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
      headers: { 'Content-Type': 'application/json' },
      body: { ok: false, error: error.message }
    };
  }
};

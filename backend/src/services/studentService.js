const mongoose = require("mongoose");

const {
  Test,
  TestSlot,
  TestQuestionSet,
  Question,
  QuestionOption,
  TestCandidate,
  TestAttempt,
  AttemptAnswer,
  TestResult,
  ActivityLog,
} = require("../models");
const ApiError = require("../utils/apiError");
const { parsePagination, buildPaginationMeta } = require("../utils/pagination");
const {
  getAttemptWithContext,
  computeAttemptDeadline,
  calculateAttemptSnapshot,
  upsertAttemptResult,
  evaluateMcqAnswer,
  evaluateTextAnswer,
} = require("./resultService");

function ensureStudentRole(user) {
  if (!user || !["student", "admin"].includes(user.role)) {
    throw new ApiError(403, "Only student or admin can access this resource");
  }
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getObjectId(value) {
  return new mongoose.Types.ObjectId(String(value));
}

async function logStudentActivity(
  userId,
  entityType,
  entityId,
  action,
  description,
  metadata,
) {
  await ActivityLog.create({
    user_id: userId,
    entity_type: entityType,
    entity_id: entityId,
    action,
    description,
    metadata,
  });
}

async function getCandidateByTest(testId, studentId) {
  const candidate = await TestCandidate.findOne({
    test_id: testId,
    student_id: studentId,
  }).lean();

  if (!candidate) {
    throw new ApiError(404, "Test assignment not found for this student");
  }

  return candidate;
}

async function getStudentAttempt(attemptId, studentId) {
  const attempt = await TestAttempt.findById(attemptId);

  if (!attempt) {
    throw new ApiError(404, "Attempt not found");
  }

  if (String(attempt.student_id) !== String(studentId)) {
    throw new ApiError(403, "You do not have access to this attempt");
  }

  return attempt;
}

async function syncAttemptProgress(attemptId) {
  const attempt = await TestAttempt.findById(attemptId);
  if (!attempt) {
    throw new ApiError(404, "Attempt not found");
  }

  const snapshot = await calculateAttemptSnapshot(attempt);

  const updatedAttempt = await TestAttempt.findByIdAndUpdate(
    attempt._id,
    {
      total_questions: snapshot.totals.total_questions,
      total_marks: snapshot.totals.total_marks,
      answered_count: snapshot.totals.answered_count,
      skipped_count: snapshot.totals.skipped_count,
      correct_count: snapshot.totals.correct_count,
      wrong_count: snapshot.totals.wrong_count,
      text_pending_review_count: snapshot.totals.text_pending_review_count,
      obtained_marks: snapshot.totals.obtained_marks,
    },
    {
      new: true,
      runValidators: true,
    },
  );

  return updatedAttempt;
}

async function autoSubmitIfTimedOut(attempt) {
  if (attempt.status !== "in_progress") {
    return {
      attempt,
      autoSubmitted: false,
      timedOut: false,
      deadline: null,
      result: null,
    };
  }

  const { test, slot } = await getAttemptWithContext(attempt._id);
  const deadlineInfo = computeAttemptDeadline(attempt, test, slot);

  if (!deadlineInfo.isTimedOut) {
    return {
      attempt,
      autoSubmitted: false,
      timedOut: false,
      deadline: deadlineInfo.deadline,
      result: null,
    };
  }

  const finalization = await upsertAttemptResult(attempt, {
    status: "timeout",
    autoSubmitted: true,
    submittedAt: deadlineInfo.now,
  });

  await logStudentActivity(
    attempt.student_id,
    "TestAttempt",
    attempt._id,
    "attempt_timeout_auto_submitted",
    "Attempt auto-submitted on timeout",
    {
      attempt_id: String(attempt._id),
      test_id: String(attempt.test_id),
    },
  );

  return {
    attempt: finalization.attempt,
    autoSubmitted: true,
    timedOut: true,
    deadline: deadlineInfo.deadline,
    result: finalization.result,
  };
}

async function getOrderedQuestions(questionSetId) {
  return Question.find({
    question_set_id: questionSetId,
    status: { $ne: "deleted" },
  })
    .sort({ question_no: 1, _id: 1 })
    .lean();
}

function sanitizeQuestionForStudent(question, options = []) {
  return {
    _id: question._id,
    question_no: question.question_no,
    question_type: question.question_type,
    title_html: question.title_html,
    plain_text: question.plain_text,
    score: question.score,
    negative_mark: question.negative_mark,
    is_required: question.is_required,
    options: options.map((option) => ({
      _id: option._id,
      option_key: option.option_key,
      option_text_html: option.option_text_html,
      plain_text: option.plain_text,
      sort_order: option.sort_order,
    })),
  };
}

function buildRemainingSeconds(deadline) {
  if (!deadline) {
    return null;
  }

  return Math.max(
    0,
    Math.floor((new Date(deadline).getTime() - Date.now()) / 1000),
  );
}

async function listAssignedTests(query, user) {
  ensureStudentRole(user);

  const { page, limit, skip } = parsePagination(query, { page: 1, limit: 10 });

  const pipeline = [
    {
      $match: {
        student_id: getObjectId(user._id),
        is_eligible: true,
      },
    },
    {
      $lookup: {
        from: "tests",
        localField: "test_id",
        foreignField: "_id",
        as: "test",
      },
    },
    { $unwind: "$test" },
    {
      $lookup: {
        from: "testquestionsets",
        localField: "question_set_id",
        foreignField: "_id",
        as: "question_set",
      },
    },
    {
      $addFields: {
        question_set: { $arrayElemAt: ["$question_set", 0] },
      },
    },
  ];

  if (query.search) {
    pipeline.push({
      $match: {
        "test.title": {
          $regex: escapeRegex(String(query.search).trim()),
          $options: "i",
        },
      },
    });
  }

  pipeline.push(
    { $sort: { "test.start_time": -1, assigned_at: -1 } },
    {
      $project: {
        _id: 0,
        candidate_id: "$_id",
        test_id: "$test._id",
        title: "$test.title",
        duration_minutes: "$test.duration_minutes",
        total_questions: {
          $ifNull: [
            "$question_set.total_questions",
            "$test.total_question_set",
          ],
        },
        negative_mark_per_wrong: "$test.negative_mark_per_wrong",
        start_time: "$test.start_time",
        end_time: "$test.end_time",
        status: "$test.status",
        attendance_status: "$attendance_status",
      },
    },
  );

  const countPipeline = [...pipeline, { $count: "total" }];
  const dataPipeline = [...pipeline, { $skip: skip }, { $limit: limit }];

  const [rows, totalRows] = await Promise.all([
    TestCandidate.aggregate(dataPipeline),
    TestCandidate.aggregate(countPipeline),
  ]);

  const total = totalRows[0]?.total || 0;

  return {
    items: rows,
    meta: buildPaginationMeta({ total, page, limit }),
  };
}

async function listPerformedExams(query, user) {
  ensureStudentRole(user);

  const { page, limit, skip } = parsePagination(query, { page: 1, limit: 10 });

  const statusFilter = String(query.status || "all").toLowerCase();
  const statuses =
    statusFilter === "all" ? ["submitted", "timeout"] : [statusFilter];

  const pipeline = [
    {
      $match: {
        student_id: getObjectId(user._id),
        status: { $in: statuses },
      },
    },
    {
      $lookup: {
        from: "tests",
        localField: "test_id",
        foreignField: "_id",
        as: "test",
      },
    },
    { $unwind: "$test" },
  ];

  if (query.search) {
    pipeline.push({
      $match: {
        "test.title": {
          $regex: escapeRegex(String(query.search).trim()),
          $options: "i",
        },
      },
    });
  }

  pipeline.push(
    { $sort: { submitted_at: -1, started_at: -1, updated_at: -1, _id: -1 } },
    {
      $project: {
        _id: 1,
        test_id: 1,
        question_set_id: 1,
        slot_id: 1,
        attempt_no: 1,
        started_at: 1,
        submitted_at: 1,
        status: 1,
        auto_submitted: 1,
        total_questions: 1,
        answered_count: 1,
        skipped_count: 1,
        correct_count: 1,
        wrong_count: 1,
        text_pending_review_count: 1,
        total_marks: 1,
        obtained_marks: 1,
        created_at: 1,
        updated_at: 1,
        test: {
          _id: "$test._id",
          title: "$test.title",
          slug: "$test.slug",
          status: "$test.status",
          start_time: "$test.start_time",
          end_time: "$test.end_time",
          duration_minutes: "$test.duration_minutes",
          show_result_to_student: "$test.show_result_to_student",
        },
      },
    },
  );

  const countPipeline = [...pipeline, { $count: "total" }];
  const dataPipeline = [...pipeline, { $skip: skip }, { $limit: limit }];

  const [rows, totalRows] = await Promise.all([
    TestAttempt.aggregate(dataPipeline),
    TestAttempt.aggregate(countPipeline),
  ]);

  const attemptIds = rows.map((row) => row._id);
  const results = attemptIds.length
    ? await TestResult.find({
        attempt_id: {
          $in: attemptIds,
        },
      }).lean()
    : [];

  const resultMap = new Map(
    results.map((result) => [String(result.attempt_id), result]),
  );

  const items = rows.map((row) => {
    const result = resultMap.get(String(row._id));
    const canShowResult = Boolean(row.test?.show_result_to_student);

    return {
      attempt_id: row._id,
      test_id: row.test_id,
      slot_id: row.slot_id,
      question_set_id: row.question_set_id,
      attempt_no: row.attempt_no,
      attempt_status: row.status,
      started_at: row.started_at,
      submitted_at: row.submitted_at,
      auto_submitted: row.auto_submitted,
      totals: {
        total_questions: row.total_questions,
        answered: row.answered_count,
        skipped: row.skipped_count,
        correct: row.correct_count,
        wrong: row.wrong_count,
        text_pending_review_count: row.text_pending_review_count,
        total_marks: row.total_marks,
        obtained_marks: row.obtained_marks,
      },
      test: {
        test_id: row.test?._id,
        title: row.test?.title,
        slug: row.test?.slug,
        status: row.test?.status,
        start_time: row.test?.start_time,
        end_time: row.test?.end_time,
        duration_minutes: row.test?.duration_minutes,
      },
      result_available: canShowResult && Boolean(result),
      result_summary:
        canShowResult && result ? buildResultSummaryPayload(result) : null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  });

  const total = totalRows[0]?.total || 0;

  return {
    items,
    meta: buildPaginationMeta({ total, page, limit }),
  };
}

async function getAssignedTestDetails(testId, user) {
  ensureStudentRole(user);

  const candidate = await TestCandidate.findOne({
    test_id: testId,
    student_id: user._id,
    is_eligible: true,
  })
    .populate("test_id")
    .populate("question_set_id")
    .populate("slot_id")
    .lean();

  if (!candidate) {
    throw new ApiError(404, "Assigned test not found");
  }

  return {
    candidate_id: candidate._id,
    test_id: candidate.test_id._id,
    title: candidate.test_id.title,
    duration_minutes: candidate.test_id.duration_minutes,
    total_questions: candidate.question_set_id?.total_questions || 0,
    negative_mark_per_wrong: candidate.test_id.negative_mark_per_wrong,
    start_time: candidate.test_id.start_time,
    end_time: candidate.test_id.end_time,
    status: candidate.test_id.status,
    attendance_status: candidate.attendance_status,
    slot: {
      slot_id: candidate.slot_id?._id || null,
      slot_no: candidate.slot_id?.slot_no || null,
      start_time: candidate.slot_id?.start_time || null,
      end_time: candidate.slot_id?.end_time || null,
    },
  };
}

async function getStudentDashboardMetrics(user) {
  ensureStudentRole(user);

  const [assignedTests, completedTests, aggregateResult, latestResult] =
    await Promise.all([
      TestCandidate.countDocuments({ student_id: user._id, is_eligible: true }),
      TestCandidate.countDocuments({
        student_id: user._id,
        attendance_status: { $in: ["submitted", "timeout"] },
      }),
      TestResult.aggregate([
        {
          $match: {
            student_id: getObjectId(user._id),
          },
        },
        {
          $group: {
            _id: null,
            total_correct: { $sum: "$correct" },
            total_wrong: { $sum: "$wrong" },
            total_skipped: { $sum: "$skipped" },
            average_marks: { $avg: "$final_marks" },
            highest_marks: { $max: "$final_marks" },
            total_negative_marks: { $sum: "$negative_marks" },
            best_test_score: { $max: "$final_marks" },
          },
        },
      ]),
      TestResult.findOne({ student_id: user._id })
        .sort({ updated_at: -1, created_at: -1 })
        .select("final_marks")
        .lean(),
    ]);

  const stats = aggregateResult[0] || {};
  const totalCorrect = Number(stats.total_correct || 0);
  const totalWrong = Number(stats.total_wrong || 0);

  const accuracyRate =
    totalCorrect + totalWrong > 0
      ? (totalCorrect / (totalCorrect + totalWrong)) * 100
      : 0;

  return {
    assigned_tests: assignedTests,
    completed_tests: completedTests,
    pending_tests: Math.max(0, assignedTests - completedTests),
    total_correct: totalCorrect,
    total_wrong: totalWrong,
    total_skipped: Number(stats.total_skipped || 0),
    average_marks: Number(stats.average_marks || 0),
    highest_marks: Number(stats.highest_marks || 0),
    accuracy_rate: Number(accuracyRate.toFixed(2)),
    total_negative_marks: Number(stats.total_negative_marks || 0),
    best_test_score: Number(stats.best_test_score || 0),
    last_test_score: Number(latestResult?.final_marks || 0),
  };
}

async function startTest(testId, payload, user) {
  ensureStudentRole(user);

  const candidate = await getCandidateByTest(testId, user._id);

  if (!candidate.is_eligible) {
    throw new ApiError(403, "You are not eligible for this test");
  }

  const [test, slot, questionSet] = await Promise.all([
    Test.findById(candidate.test_id).lean(),
    TestSlot.findById(candidate.slot_id).lean(),
    TestQuestionSet.findById(candidate.question_set_id).lean(),
  ]);

  if (!test || !slot || !questionSet) {
    throw new ApiError(400, "Test assignment is invalid");
  }

  if (!["published", "running"].includes(test.status)) {
    throw new ApiError(400, "Test is not available to start");
  }

  const now = new Date();
  const allowedStart = new Date(
    Math.max(
      new Date(test.start_time).getTime(),
      new Date(slot.start_time).getTime(),
    ),
  );
  const allowedEnd = new Date(
    Math.min(
      new Date(test.end_time).getTime(),
      new Date(slot.end_time).getTime(),
    ),
  );

  if (now < allowedStart) {
    throw new ApiError(400, "Test has not started yet for your assigned slot");
  }

  if (now > allowedEnd) {
    throw new ApiError(400, "Test time window has ended");
  }

  const latestAttempt = await TestAttempt.findOne({
    test_id: test._id,
    student_id: user._id,
  }).sort({ attempt_no: -1, created_at: -1 });

  if (latestAttempt) {
    const timeoutResult = await autoSubmitIfTimedOut(latestAttempt);

    if (timeoutResult.attempt.status === "in_progress") {
      return {
        attempt_id: timeoutResult.attempt._id,
        status: timeoutResult.attempt.status,
        auto_resumed: true,
        current_question_no: timeoutResult.attempt.current_question_no,
        remaining_seconds: buildRemainingSeconds(timeoutResult.deadline),
      };
    }

    throw new ApiError(400, "Attempt already completed for this test");
  }

  const questions = await getOrderedQuestions(questionSet._id);

  if (questions.length < 1) {
    throw new ApiError(
      400,
      "No active questions available for assigned question set",
    );
  }

  const totalMarks = questions.reduce(
    (sum, question) => sum + Number(question.score || 0),
    0,
  );

  const attempt = await TestAttempt.create({
    test_id: test._id,
    student_id: user._id,
    slot_id: slot._id,
    question_set_id: questionSet._id,
    attempt_no: 1,
    started_at: now,
    status: "in_progress",
    current_question_no: 1,
    total_questions: questions.length,
    total_marks: totalMarks,
    answered_count: 0,
    skipped_count: 0,
    obtained_marks: 0,
    device_info: payload.device_info || {},
  });

  await TestCandidate.findOneAndUpdate(
    {
      test_id: test._id,
      student_id: user._id,
    },
    {
      attendance_status: "in_progress",
      started_at: now,
    },
  );

  await logStudentActivity(
    user._id,
    "TestAttempt",
    attempt._id,
    "attempt_started",
    "Student started a test attempt",
    {
      test_id: String(test._id),
      question_set_id: String(questionSet._id),
    },
  );

  const deadlineInfo = computeAttemptDeadline(attempt, test, slot);

  return {
    attempt_id: attempt._id,
    status: attempt.status,
    auto_resumed: false,
    current_question_no: attempt.current_question_no,
    remaining_seconds: buildRemainingSeconds(deadlineInfo.deadline),
  };
}

async function getCurrentQuestion(attemptId, user) {
  ensureStudentRole(user);

  const attempt = await getStudentAttempt(attemptId, user._id);
  const timeoutResult = await autoSubmitIfTimedOut(attempt);

  if (timeoutResult.timedOut) {
    return {
      status: "timeout",
      auto_submitted: true,
      attempt_id: timeoutResult.attempt._id,
      current_question: null,
      remaining_seconds: 0,
    };
  }

  if (timeoutResult.attempt.status !== "in_progress") {
    return {
      status: timeoutResult.attempt.status,
      auto_submitted: timeoutResult.attempt.auto_submitted,
      attempt_id: timeoutResult.attempt._id,
      current_question: null,
      remaining_seconds: 0,
    };
  }

  const questions = await getOrderedQuestions(
    timeoutResult.attempt.question_set_id,
  );

  const index = timeoutResult.attempt.current_question_no - 1;
  const currentQuestion = questions[index] || null;

  if (!currentQuestion) {
    return {
      status: timeoutResult.attempt.status,
      attempt_id: timeoutResult.attempt._id,
      current_question: null,
      remaining_seconds: buildRemainingSeconds(timeoutResult.deadline),
      message: "No more questions in progression. Submit your test.",
    };
  }

  const [options, existingAnswer] = await Promise.all([
    currentQuestion.question_type === "text"
      ? Promise.resolve([])
      : QuestionOption.find({ question_id: currentQuestion._id })
          .sort({ sort_order: 1 })
          .lean(),
    AttemptAnswer.findOne({
      attempt_id: timeoutResult.attempt._id,
      question_id: currentQuestion._id,
    }).lean(),
  ]);

  return {
    status: timeoutResult.attempt.status,
    attempt_id: timeoutResult.attempt._id,
    current_question_no: timeoutResult.attempt.current_question_no,
    total_questions: questions.length,
    remaining_seconds: buildRemainingSeconds(timeoutResult.deadline),
    current_question: sanitizeQuestionForStudent(currentQuestion, options),
    existing_answer: existingAnswer
      ? {
          _id: existingAnswer._id,
          question_id: existingAnswer.question_id,
          selected_option_ids: existingAnswer.selected_option_ids || [],
          text_answer_html: existingAnswer.text_answer_html,
          text_answer_plain: existingAnswer.text_answer_plain,
          is_skipped: existingAnswer.is_skipped,
          answered_at: existingAnswer.answered_at,
        }
      : null,
  };
}

async function answerCurrentQuestion(attemptId, payload, user) {
  ensureStudentRole(user);

  const attempt = await getStudentAttempt(attemptId, user._id);
  const timeoutResult = await autoSubmitIfTimedOut(attempt);

  if (timeoutResult.timedOut) {
    throw new ApiError(409, "Attempt auto-submitted due to timeout");
  }

  if (timeoutResult.attempt.status !== "in_progress") {
    throw new ApiError(400, "Attempt is already completed");
  }

  const questions = await getOrderedQuestions(
    timeoutResult.attempt.question_set_id,
  );
  const index = timeoutResult.attempt.current_question_no - 1;
  const currentQuestion = questions[index];

  if (!currentQuestion) {
    throw new ApiError(
      400,
      "No current question available. Please submit the attempt.",
    );
  }

  const test = await Test.findById(timeoutResult.attempt.test_id).lean();
  if (!test) {
    throw new ApiError(400, "Test not found for attempt");
  }

  let evaluatedAnswer;

  if (["radio", "checkbox"].includes(currentQuestion.question_type)) {
    evaluatedAnswer = await evaluateMcqAnswer({
      question: currentQuestion,
      answerPayload: payload,
      test,
    });
  } else {
    evaluatedAnswer = evaluateTextAnswer({
      question: currentQuestion,
      answerPayload: payload,
    });
  }

  await AttemptAnswer.findOneAndUpdate(
    {
      attempt_id: timeoutResult.attempt._id,
      question_id: currentQuestion._id,
    },
    {
      test_id: timeoutResult.attempt.test_id,
      student_id: timeoutResult.attempt.student_id,
      attempt_id: timeoutResult.attempt._id,
      question_id: currentQuestion._id,
      question_type: currentQuestion.question_type,
      selected_option_ids: evaluatedAnswer.selected_option_ids,
      text_answer_html: evaluatedAnswer.text_answer_html,
      text_answer_plain: evaluatedAnswer.text_answer_plain,
      is_skipped: false,
      is_correct: evaluatedAnswer.is_correct,
      obtained_marks: evaluatedAnswer.obtained_marks,
      negative_marks_applied: evaluatedAnswer.negative_marks_applied,
      checked_by_system: evaluatedAnswer.checked_by_system,
      checked_by_teacher: evaluatedAnswer.checked_by_teacher,
      review_status: evaluatedAnswer.review_status,
      answered_at: new Date(),
    },
    {
      upsert: true,
      new: true,
      runValidators: true,
      setDefaultsOnInsert: true,
    },
  );

  const nextQuestionNo = Math.min(
    timeoutResult.attempt.current_question_no + 1,
    questions.length + 1,
  );

  await TestAttempt.findByIdAndUpdate(timeoutResult.attempt._id, {
    current_question_no: nextQuestionNo,
  });

  const synced = await syncAttemptProgress(timeoutResult.attempt._id);

  return {
    attempt_id: synced._id,
    status: synced.status,
    current_question_no: synced.current_question_no,
    total_questions: questions.length,
    is_last_question: index === questions.length - 1,
  };
}

async function skipCurrentQuestion(attemptId, user) {
  ensureStudentRole(user);

  const attempt = await getStudentAttempt(attemptId, user._id);
  const timeoutResult = await autoSubmitIfTimedOut(attempt);

  if (timeoutResult.timedOut) {
    throw new ApiError(409, "Attempt auto-submitted due to timeout");
  }

  if (timeoutResult.attempt.status !== "in_progress") {
    throw new ApiError(400, "Attempt is already completed");
  }

  const questions = await getOrderedQuestions(
    timeoutResult.attempt.question_set_id,
  );
  const index = timeoutResult.attempt.current_question_no - 1;
  const currentQuestion = questions[index];

  if (!currentQuestion) {
    throw new ApiError(
      400,
      "No current question available. Please submit the attempt.",
    );
  }

  await AttemptAnswer.findOneAndUpdate(
    {
      attempt_id: timeoutResult.attempt._id,
      question_id: currentQuestion._id,
    },
    {
      test_id: timeoutResult.attempt.test_id,
      student_id: timeoutResult.attempt.student_id,
      attempt_id: timeoutResult.attempt._id,
      question_id: currentQuestion._id,
      question_type: currentQuestion.question_type,
      selected_option_ids: [],
      text_answer_html: null,
      text_answer_plain: null,
      is_skipped: true,
      is_correct: null,
      obtained_marks: 0,
      negative_marks_applied: 0,
      checked_by_system: false,
      checked_by_teacher: false,
      review_status: "auto_checked",
      answered_at: new Date(),
    },
    {
      upsert: true,
      runValidators: true,
      setDefaultsOnInsert: true,
    },
  );

  const nextQuestionNo = Math.min(
    timeoutResult.attempt.current_question_no + 1,
    questions.length + 1,
  );

  await TestAttempt.findByIdAndUpdate(timeoutResult.attempt._id, {
    current_question_no: nextQuestionNo,
  });

  const synced = await syncAttemptProgress(timeoutResult.attempt._id);

  return {
    attempt_id: synced._id,
    status: synced.status,
    current_question_no: synced.current_question_no,
    total_questions: questions.length,
    is_last_question: index === questions.length - 1,
  };
}

function buildResultSummaryPayload(result) {
  return {
    total_questions: result.total_questions,
    answered: result.answered,
    skipped: result.skipped,
    correct: result.correct,
    wrong: result.wrong,
    text_answered: result.text_answered,
    mcq_marks: result.mcq_marks,
    negative_marks: result.negative_marks,
    manual_added_marks: result.manual_added_marks,
    final_marks: result.final_marks,
    percentage: result.percentage,
    grade: result.grade,
    result_status: result.result_status,
    published_at: result.published_at,
  };
}

async function submitAttempt(attemptId, user) {
  ensureStudentRole(user);

  const attempt = await getStudentAttempt(attemptId, user._id);

  if (["submitted", "timeout"].includes(attempt.status)) {
    const existingResult = await TestResult.findOne({
      attempt_id: attempt._id,
    }).lean();
    const test = await Test.findById(attempt.test_id).lean();

    return {
      attempt_id: attempt._id,
      status: attempt.status,
      auto_submitted: attempt.auto_submitted,
      result_available: Boolean(test?.show_result_to_student),
      result_summary:
        test?.show_result_to_student && existingResult
          ? buildResultSummaryPayload(existingResult)
          : null,
    };
  }

  if (attempt.status !== "in_progress") {
    throw new ApiError(400, "Attempt cannot be submitted from current status");
  }

  const { test, slot } = await getAttemptWithContext(attempt._id);
  const deadlineInfo = computeAttemptDeadline(attempt, test, slot);

  const finalStatus = deadlineInfo.isTimedOut ? "timeout" : "submitted";

  const finalization = await upsertAttemptResult(attempt, {
    status: finalStatus,
    autoSubmitted: deadlineInfo.isTimedOut,
    submittedAt: deadlineInfo.now,
  });

  await logStudentActivity(
    user._id,
    "TestAttempt",
    attempt._id,
    deadlineInfo.isTimedOut ? "attempt_timeout_submitted" : "attempt_submitted",
    deadlineInfo.isTimedOut
      ? "Student attempt submitted due to timeout"
      : "Student submitted attempt",
    {
      test_id: String(attempt.test_id),
      attempt_id: String(attempt._id),
    },
  );

  return {
    attempt_id: finalization.attempt._id,
    status: finalization.attempt.status,
    auto_submitted: finalization.attempt.auto_submitted,
    result_available: Boolean(
      finalization.snapshot.test.show_result_to_student,
    ),
    result_summary: finalization.snapshot.test.show_result_to_student
      ? buildResultSummaryPayload(finalization.result)
      : null,
  };
}

async function getAttemptResult(attemptId, user) {
  ensureStudentRole(user);

  const attempt = await getStudentAttempt(attemptId, user._id);

  if (attempt.status === "in_progress") {
    const timeoutResult = await autoSubmitIfTimedOut(attempt);

    if (timeoutResult.timedOut) {
      const test = await Test.findById(attempt.test_id).lean();
      const result = timeoutResult.result
        ? timeoutResult.result.toObject
          ? timeoutResult.result.toObject()
          : timeoutResult.result
        : await TestResult.findOne({ attempt_id: attempt._id }).lean();

      return {
        attempt_id: timeoutResult.attempt._id,
        status: timeoutResult.attempt.status,
        auto_submitted: true,
        result_available: Boolean(test?.show_result_to_student),
        result_summary:
          test?.show_result_to_student && result
            ? buildResultSummaryPayload(result)
            : null,
      };
    }

    throw new ApiError(400, "Attempt is still in progress");
  }

  const [test, result] = await Promise.all([
    Test.findById(attempt.test_id).lean(),
    TestResult.findOne({ attempt_id: attempt._id }).lean(),
  ]);

  if (!test) {
    throw new ApiError(400, "Test not found for attempt");
  }

  if (!result) {
    const finalization = await upsertAttemptResult(attempt, {
      status: attempt.status,
      autoSubmitted: attempt.auto_submitted,
      submittedAt: attempt.submitted_at || new Date(),
    });

    if (!test.show_result_to_student) {
      return {
        attempt_id: finalization.attempt._id,
        status: finalization.attempt.status,
        result_available: false,
        result_summary: null,
      };
    }

    return {
      attempt_id: finalization.attempt._id,
      status: finalization.attempt.status,
      result_available: true,
      result_summary: buildResultSummaryPayload(finalization.result),
    };
  }

  if (!test.show_result_to_student) {
    return {
      attempt_id: attempt._id,
      status: attempt.status,
      result_available: false,
      result_summary: null,
    };
  }

  return {
    attempt_id: attempt._id,
    status: attempt.status,
    result_available: true,
    result_summary: buildResultSummaryPayload(result),
  };
}

module.exports = {
  listAssignedTests,
  listPerformedExams,
  getAssignedTestDetails,
  getStudentDashboardMetrics,
  startTest,
  getCurrentQuestion,
  answerCurrentQuestion,
  skipCurrentQuestion,
  submitAttempt,
  getAttemptResult,
};

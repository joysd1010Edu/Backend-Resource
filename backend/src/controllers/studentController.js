const studentService = require("../services/studentService");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/apiResponse");

const getAssignedTests = asyncHandler(async (req, res) => {
  const result = await studentService.listAssignedTests(req.query, req.user);
  sendSuccess(res, result.items, "Assigned tests fetched", 200, result.meta);
});

const getPerformedExams = asyncHandler(async (req, res) => {
  const result = await studentService.listPerformedExams(req.query, req.user);
  sendSuccess(
    res,
    result.items,
    "Performed exams with attempts fetched",
    200,
    result.meta,
  );
});

const getDashboardMetrics = asyncHandler(async (req, res) => {
  const metrics = await studentService.getStudentDashboardMetrics(req.user);
  sendSuccess(res, metrics, "Dashboard metrics fetched");
});

const getTestById = asyncHandler(async (req, res) => {
  const test = await studentService.getAssignedTestDetails(
    req.params.testId,
    req.user,
  );
  sendSuccess(res, test, "Assigned test details fetched");
});

const startTest = asyncHandler(async (req, res) => {
  const data = await studentService.startTest(
    req.params.testId,
    req.body,
    req.user,
  );
  sendSuccess(res, data, "Test started successfully", 201);
});

const getCurrentQuestion = asyncHandler(async (req, res) => {
  const data = await studentService.getCurrentQuestion(
    req.params.attemptId,
    req.user,
  );
  sendSuccess(res, data, "Current question fetched");
});

const saveAnswer = asyncHandler(async (req, res) => {
  const data = await studentService.answerCurrentQuestion(
    req.params.attemptId,
    req.body,
    req.user,
  );
  sendSuccess(res, data, "Answer saved successfully");
});

const skipQuestion = asyncHandler(async (req, res) => {
  const data = await studentService.skipCurrentQuestion(
    req.params.attemptId,
    req.user,
  );
  sendSuccess(res, data, "Question skipped successfully");
});

const submitAttempt = asyncHandler(async (req, res) => {
  const data = await studentService.submitAttempt(
    req.params.attemptId,
    req.user,
  );
  sendSuccess(res, data, "Attempt submitted successfully");
});

const getAttemptResult = asyncHandler(async (req, res) => {
  const data = await studentService.getAttemptResult(
    req.params.attemptId,
    req.user,
  );
  sendSuccess(res, data, "Attempt result fetched");
});

module.exports = {
  getAssignedTests,
  getPerformedExams,
  getDashboardMetrics,
  getTestById,
  startTest,
  getCurrentQuestion,
  saveAnswer,
  skipQuestion,
  submitAttempt,
  getAttemptResult,
};

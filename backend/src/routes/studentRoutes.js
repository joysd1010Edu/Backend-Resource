const express = require("express");

const auth = require("../middlewares/authMiddleware");
const allowRoles = require("../middlewares/roleMiddleware");
const validateRequest = require("../middlewares/validateRequest");
const studentController = require("../controllers/studentController");
const {
  studentTestsQueryValidator,
  performedExamsQueryValidator,
  testIdParamValidator,
  attemptIdParamValidator,
  startTestValidator,
  answerAttemptValidator,
  skipAttemptValidator,
  submitAttemptValidator,
  resultAttemptValidator,
} = require("../validators/studentValidators");

const router = express.Router();

router.use(auth, allowRoles("student", "admin"));

router.get(
  "/tests",
  studentTestsQueryValidator,
  validateRequest,
  studentController.getAssignedTests,
);
router.get(
  "/attempts/history",
  performedExamsQueryValidator,
  validateRequest,
  studentController.getPerformedExams,
);
router.get("/dashboard/metrics", studentController.getDashboardMetrics);
router.get(
  "/tests/:testId",
  testIdParamValidator,
  validateRequest,
  studentController.getTestById,
);
router.post(
  "/tests/:testId/start",
  startTestValidator,
  validateRequest,
  studentController.startTest,
);

router.get(
  "/attempts/:attemptId/current-question",
  attemptIdParamValidator,
  validateRequest,
  studentController.getCurrentQuestion,
);
router.post(
  "/attempts/:attemptId/answer",
  answerAttemptValidator,
  validateRequest,
  studentController.saveAnswer,
);
router.post(
  "/attempts/:attemptId/skip",
  skipAttemptValidator,
  validateRequest,
  studentController.skipQuestion,
);
router.post(
  "/attempts/:attemptId/submit",
  submitAttemptValidator,
  validateRequest,
  studentController.submitAttempt,
);
router.get(
  "/attempts/:attemptId/result",
  resultAttemptValidator,
  validateRequest,
  studentController.getAttemptResult,
);

module.exports = router;

const User = require("./user.model");
const Test = require("./test.model");
const TestSlot = require("./testSlot.model");
const TestQuestionSet = require("./testQuestionSet.model");
const Question = require("./question.model");
const QuestionOption = require("./questionOption.model");
const TestCandidate = require("./testCandidate.model");
const TestAttempt = require("./testAttempt.model");
const AttemptAnswer = require("./attemptAnswer.model");
const TestResult = require("./testResult.model");
const ActivityLog = require("./activityLog.model");
const RefreshToken = require("./refreshToken.model");

const modelMap = {
  User,
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
  RefreshToken,
};

async function syncAllIndexes() {
  for (const model of Object.values(modelMap)) {
    await model.syncIndexes();
  }
}

module.exports = {
  ...modelMap,
  syncAllIndexes,
};

/* ==========  backend/src/models/testResult.model.js  ===============*/
const mongoose = require("mongoose");

const { RESULT_STATUS } = require("../utils/enums");

const testResultSchema = new mongoose.Schema(
  {
    test_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Test",
      required: [true, "test_id is required"],
      index: true,
    },
    attempt_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TestAttempt",
      required: [true, "attempt_id is required"],
      unique: true,
      index: true,
    },
    student_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "student_id is required"],
      index: true,
    },
    slot_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TestSlot",
      required: [true, "slot_id is required"],
      index: true,
    },
    question_set_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TestQuestionSet",
      required: [true, "question_set_id is required"],
      index: true,
    },
    total_questions: {
      type: Number,
      default: 0,
      min: 0,
    },
    answered: {
      type: Number,
      default: 0,
      min: 0,
    },
    skipped: {
      type: Number,
      default: 0,
      min: 0,
    },
    correct: {
      type: Number,
      default: 0,
      min: 0,
    },
    wrong: {
      type: Number,
      default: 0,
      min: 0,
    },
    text_answered: {
      type: Number,
      default: 0,
      min: 0,
    },
    mcq_marks: {
      type: Number,
      default: 0,
    },
    negative_marks: {
      type: Number,
      default: 0,
    },
    manual_added_marks: {
      type: Number,
      default: 0,
    },
    final_marks: {
      type: Number,
      default: 0,
    },
    percentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    grade: {
      type: String,
      trim: true,
      default: null,
    },
    result_status: {
      type: String,
      enum: RESULT_STATUS,
      default: "published",
      index: true,
    },
    published_at: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    versionKey: false,
  },
);

testResultSchema.index({ test_id: 1, student_id: 1, slot_id: 1 });

testResultSchema.pre("save", function setPublishedAt() {
  if (this.result_status === "published" && !this.published_at) {
    this.published_at = new Date();
  }
});

const TestResult = mongoose.model("TestResult", testResultSchema);

module.exports = TestResult;

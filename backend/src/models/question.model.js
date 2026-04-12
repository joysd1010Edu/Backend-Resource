/* ==========  backend/src/models/question.model.js  ===============*/
const mongoose = require("mongoose");

const { QUESTION_TYPES, QUESTION_STATUS } = require("../utils/enums");

const questionSchema = new mongoose.Schema(
  {
    test_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Test",
      required: [true, "test_id is required"],
      index: true,
    },
    question_set_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TestQuestionSet",
      required: [true, "question_set_id is required"],
      index: true,
    },
    question_no: {
      type: Number,
      required: [true, "question_no is required"],
      min: 1,
    },
    question_type: {
      type: String,
      enum: QUESTION_TYPES,
      required: [true, "question_type is required"],
      index: true,
    },
    title_html: {
      type: String,
      required: [true, "title_html is required"],
      trim: true,
    },
    plain_text: {
      type: String,
      default: "",
    },
    score: {
      type: Number,
      required: true,
      default: 1,
      min: 0,
    },
    negative_mark: {
      type: Number,
      default: 0,
      min: 0,
    },
    has_options: {
      type: Boolean,
      default: false,
    },
    correct_text_answer: {
      type: String,
      default: null,
    },
    explanation: {
      type: String,
      default: null,
    },
    is_required: {
      type: Boolean,
      default: true,
    },
    status: {
      type: String,
      enum: QUESTION_STATUS,
      default: "active",
      index: true,
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "created_by is required"],
      index: true,
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    versionKey: false,
  },
);

questionSchema.index({ question_set_id: 1, question_no: 1 }, { unique: true });
questionSchema.index({ test_id: 1, question_set_id: 1, status: 1 });

questionSchema.pre("validate", function setHasOptions() {
  if (["radio", "checkbox"].includes(this.question_type)) {
    this.has_options = true;
  }

  if (this.question_type === "text") {
    this.has_options = false;
  }
});

const Question = mongoose.model("Question", questionSchema);

module.exports = Question;

/* ==========  backend/src/models/test.model.js  ===============*/
const mongoose = require("mongoose");

const { QUESTION_TYPE_MODES, TEST_STATUS } = require("../utils/enums");
const { toSlug } = require("../utils/slug");

const testSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "title is required"],
      trim: true,
      maxlength: 220,
    },
    slug: {
      type: String,
      trim: true,
      unique: true,
      index: true,
      sparse: true,
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "created_by is required"],
      index: true,
    },
    total_candidates: {
      type: Number,
      default: 0,
      min: 0,
    },
    total_slots: {
      type: Number,
      default: 1,
      min: 1,
    },
    total_question_set: {
      type: Number,
      default: 1,
      min: 1,
    },
    question_type_mode: {
      type: String,
      enum: QUESTION_TYPE_MODES,
      default: "mixed",
    },
    negative_marking_enabled: {
      type: Boolean,
      default: false,
    },
    negative_mark_per_wrong: {
      type: Number,
      default: 0,
      min: 0,
    },
    start_time: {
      type: Date,
      required: [true, "start_time is required"],
    },
    end_time: {
      type: Date,
      required: [true, "end_time is required"],
      validate: {
        validator(value) {
          return !this.start_time || value > this.start_time;
        },
        message: "end_time must be greater than start_time",
      },
    },
    duration_minutes: {
      type: Number,
      required: [true, "duration_minutes is required"],
      min: 1,
    },
    status: {
      type: String,
      enum: TEST_STATUS,
      default: "draft",
      index: true,
    },
    basic_info_completed: {
      type: Boolean,
      default: false,
    },
    question_set_completed: {
      type: Boolean,
      default: false,
    },
    instructions: {
      type: String,
      default: "",
    },
    show_result_to_student: {
      type: Boolean,
      default: true,
    },
    randomize_question_order: {
      type: Boolean,
      default: false,
    },
    randomize_option_order: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    versionKey: false,
  },
);

testSchema.index({ created_by: 1, status: 1 });
testSchema.index({ start_time: 1, end_time: 1 });

testSchema.pre("validate", function buildSlug() {
  if ((this.isNew || this.isModified("title")) && !this.slug && this.title) {
    this.slug = toSlug(this.title);
  }

  if (this.isModified("slug") && this.slug) {
    this.slug = toSlug(this.slug);
  }
});

testSchema.pre("save", async function ensureUniqueSlug() {
  if (!this.slug) {
    this.slug = toSlug(this.title);
  }

  const Test = this.constructor;
  const existing = await Test.findOne({
    slug: this.slug,
    _id: { $ne: this._id },
  })
    .select("_id")
    .lean();

  if (existing) {
    this.slug = `${this.slug}-${Date.now().toString(36)}`;
  }
});

const Test = mongoose.model("Test", testSchema);

module.exports = Test;

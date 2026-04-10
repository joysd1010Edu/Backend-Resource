const mongoose = require("mongoose");

const refreshTokenSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "user_id is required"],
      index: true,
    },
    jti: {
      type: String,
      required: [true, "jti is required"],
      unique: true,
      index: true,
    },
    token_hash: {
      type: String,
      required: [true, "token_hash is required"],
      unique: true,
      index: true,
    },
    expires_at: {
      type: Date,
      required: [true, "expires_at is required"],
      index: true,
    },
    revoked_at: {
      type: Date,
      default: null,
      index: true,
    },
    replaced_by_jti: {
      type: String,
      default: null,
      index: true,
    },
    created_by_ip: {
      type: String,
      default: null,
    },
    revoked_by_ip: {
      type: String,
      default: null,
    },
    user_agent: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    versionKey: false,
  },
);

refreshTokenSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });
refreshTokenSchema.index({ user_id: 1, revoked_at: 1, expires_at: 1 });

const RefreshToken = mongoose.model("RefreshToken", refreshTokenSchema);

module.exports = RefreshToken;

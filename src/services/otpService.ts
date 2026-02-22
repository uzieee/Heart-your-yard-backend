import { QueryTypes } from "sequelize";
import sequelize from "database";
import { sendOTPEmail } from "./emailService";

const OTP_EXPIRY_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 60;

// Generate 6-digit OTP
const generateOTP = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Invalidate all previous OTPs for an email
const invalidatePreviousOTPs = async (email: string): Promise<void> => {
  await sequelize.query(
    `UPDATE email_otps 
     SET is_used = true 
     WHERE email = $1 AND is_used = false`,
    { bind: [email], type: QueryTypes.UPDATE }
  );
};

export const requestOTP = async (email: string): Promise<void> => {
  // Check if user exists
  const [user] = await sequelize.query(
    `SELECT id, username FROM users WHERE email = $1 LIMIT 1`,
    { bind: [email], type: QueryTypes.SELECT }
  ) as any[];

  if (!user) {
    throw { statusCode: 404, message: "User not found with this email" };
  }

  // Check for recent OTP request (cooldown)
  const [recentOTP] = await sequelize.query(
    `SELECT created_at FROM email_otps 
     WHERE email = $1 AND is_used = false AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 1`,
    { bind: [email], type: QueryTypes.SELECT }
  ) as any[];

  if (recentOTP) {
    const cooldownEnd = new Date(
      new Date(recentOTP.created_at).getTime() + RESEND_COOLDOWN_SECONDS * 1000
    );
    if (new Date() < cooldownEnd) {
      const secondsLeft = Math.ceil(
        (cooldownEnd.getTime() - new Date().getTime()) / 1000
      );
      throw {
        statusCode: 429,
        message: `Please wait ${secondsLeft} seconds before requesting a new OTP`,
      };
    }
  }

  // Invalidate previous OTPs
  await invalidatePreviousOTPs(email);

  // Generate new OTP
  const otp = generateOTP();
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + OTP_EXPIRY_MINUTES);

  // Store OTP
  await sequelize.query(
    `INSERT INTO email_otps (email, otp, expires_at)
     VALUES ($1, $2, $3)`,
    { bind: [email, otp, expiresAt], type: QueryTypes.INSERT }
  );

  // Send email
  await sendOTPEmail(email, otp, user.username);
};

export const verifyOTP = async (
  email: string,
  otp: string
): Promise<{ verified: boolean; message: string }> => {
  // Find valid OTP
  const [otpRecord] = await sequelize.query(
    `SELECT id, otp, expires_at, attempts, is_used
     FROM email_otps
     WHERE email = $1 AND is_used = false
     ORDER BY created_at DESC LIMIT 1`,
    { bind: [email], type: QueryTypes.SELECT }
  ) as any[];

  if (!otpRecord) {
    throw { statusCode: 404, message: "No active OTP found for this email" };
  }

  // Check if already used
  if (otpRecord.is_used) {
    throw { statusCode: 400, message: "This OTP has already been used" };
  }

  // Check if expired
  if (new Date() > new Date(otpRecord.expires_at)) {
    await sequelize.query(
      `UPDATE email_otps SET is_used = true WHERE id = $1`,
      { bind: [otpRecord.id], type: QueryTypes.UPDATE }
    );
    throw { statusCode: 400, message: "OTP has expired. Please request a new one" };
  }

  // Check attempts
  if (otpRecord.attempts >= MAX_ATTEMPTS) {
    await sequelize.query(
      `UPDATE email_otps SET is_used = true WHERE id = $1`,
      { bind: [otpRecord.id], type: QueryTypes.UPDATE }
    );
    throw {
      statusCode: 429,
      message: "Maximum verification attempts exceeded. Please request a new OTP",
    };
  }

  // Verify OTP
  if (otpRecord.otp !== otp) {
    // Increment attempts
    await sequelize.query(
      `UPDATE email_otps SET attempts = attempts + 1 WHERE id = $1`,
      { bind: [otpRecord.id], type: QueryTypes.UPDATE }
    );

    const remainingAttempts = MAX_ATTEMPTS - (otpRecord.attempts + 1);
    throw {
      statusCode: 400,
      message: `Invalid OTP. ${remainingAttempts > 0 ? `${remainingAttempts} attempts remaining` : "Maximum attempts exceeded"}`,
    };
  }

  // Mark OTP as used
  await sequelize.query(
    `UPDATE email_otps SET is_used = true WHERE id = $1`,
    { bind: [otpRecord.id], type: QueryTypes.UPDATE }
  );

  // Update user's email verification status
  await sequelize.query(
    `UPDATE users SET is_verified_email = true WHERE email = $1`,
    { bind: [email], type: QueryTypes.UPDATE }
  );

  return {
    verified: true,
    message: "Email verified successfully",
  };
};

// Cleanup expired OTPs (can be run as a cron job)
export const cleanupExpiredOTPs = async (): Promise<void> => {
  await sequelize.query(
    `DELETE FROM email_otps 
     WHERE expires_at < NOW() - INTERVAL '1 day'`,
    { type: QueryTypes.DELETE }
  );
};








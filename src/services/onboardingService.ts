import { QueryTypes } from "sequelize";
import sequelize from "database";
import { generateToken } from "@/utils/jwt";

export interface OnboardingBody {
  userId: string;
  dateOfBirth?: string | null;
  address?: string | null;
  pinLocation?: {
    lat: number;
    lng: number;
  } | null;
  gardenType?: string | null;
  experienceLevel?: string | null;
  gardenSpace?: string | null;
  plantsMaintain?: number | null;
  sharingPreference?: string | null;
  safetyDeclaration?: boolean | null;
  image?: string | null;
}

interface OnboardingRecord {
  id: string;
  user_id: string;
  date_of_birth: Date | null;
  address: string | null;
  pin_location: string | null;
  garden_type: string | null;
  experience_level: string | null;
  garden_space: string | null;
  plants_maintain: number | null;
  sharing_preference: string | null;
  safety_declaration: boolean | null;
  image: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

interface UserRecord {
  id: string;
  email: string;
  is_onboarded: boolean;
}

export const createOrUpdateOnboarding = async (
  body: OnboardingBody
): Promise<OnboardingRecord> => {
  const {
    userId,
    dateOfBirth,
    address,
    pinLocation,
    gardenType,
    experienceLevel,
    gardenSpace,
    plantsMaintain,
    sharingPreference,
    safetyDeclaration,
    image,
  } = body;

  // Check if onboarding already exists
  const existingResult = await sequelize.query(
    `SELECT id FROM onboarding WHERE user_id = $1 AND deleted_at IS NULL LIMIT 1`,
    { bind: [userId], type: QueryTypes.SELECT }
  );

  const existing = Array.isArray(existingResult) && existingResult.length > 0
    ? (existingResult[0] as { id: string })
    : null;

  let onboardingData: OnboardingRecord;

  if (existing) {
    // Update existing onboarding
    const updateFields: string[] = [];
    const values: unknown[] = [];
    let paramCount = 1;

    if (dateOfBirth !== undefined) {
      updateFields.push(`date_of_birth = $${paramCount++}`);
      values.push(dateOfBirth ? new Date(dateOfBirth) : null);
    }
    if (address !== undefined) {
      updateFields.push(`address = $${paramCount++}`);
      values.push(address || null);
    }
    if (pinLocation !== undefined) {
      updateFields.push(`pin_location = $${paramCount++}`);
      values.push(pinLocation ? JSON.stringify(pinLocation) : null);
    }
    if (gardenType !== undefined) {
      updateFields.push(`garden_type = $${paramCount++}`);
      values.push(gardenType || null);
    }
    if (experienceLevel !== undefined) {
      updateFields.push(`experience_level = $${paramCount++}`);
      values.push(experienceLevel || null);
    }
    if (gardenSpace !== undefined) {
      updateFields.push(`garden_space = $${paramCount++}`);
      values.push(gardenSpace || null);
    }
    if (plantsMaintain !== undefined) {
      updateFields.push(`plants_maintain = $${paramCount++}`);
      values.push(plantsMaintain || null);
    }
    if (sharingPreference !== undefined) {
      updateFields.push(`sharing_preference = $${paramCount++}`);
      values.push(sharingPreference || null);
    }
    if (safetyDeclaration !== undefined) {
      updateFields.push(`safety_declaration = $${paramCount++}`);
      values.push(safetyDeclaration || null);
    }
    if (image !== undefined) {
      updateFields.push(`image = $${paramCount++}`);
      values.push(image || null);
    }

    if (updateFields.length === 0) {
      // No fields to update, return existing
      const existingDataResult = await sequelize.query(
        `SELECT * FROM onboarding WHERE user_id = $1 LIMIT 1`,
        { bind: [userId], type: QueryTypes.SELECT }
      );
      const existingData = Array.isArray(existingDataResult) && existingDataResult.length > 0
        ? (existingDataResult[0] as OnboardingRecord)
        : null;
      if (!existingData) {
        throw { statusCode: 404, message: "Onboarding record not found" };
      }
      return existingData;
    }

    updateFields.push(`updated_at = NOW()`);
    values.push(userId);

    const updatedResult = await sequelize.query(
      `UPDATE onboarding 
       SET ${updateFields.join(", ")}
       WHERE user_id = $${paramCount}
       RETURNING *`,
      { bind: values, type: QueryTypes.SELECT }
    );

    const updated = Array.isArray(updatedResult) && updatedResult.length > 0
      ? (updatedResult[0] as OnboardingRecord)
      : null;

    if (!updated) {
      throw { statusCode: 500, message: "Failed to update onboarding" };
    }

    onboardingData = updated;
  } else {
    // Create new onboarding
    const newOnboardingResult = await sequelize.query(
      `INSERT INTO onboarding (
        user_id, date_of_birth, address, pin_location, garden_type,
        experience_level, garden_space, plants_maintain, sharing_preference,
        safety_declaration, image
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      {
        bind: [
          userId,
          dateOfBirth ? new Date(dateOfBirth) : null,
          address || null,
          pinLocation ? JSON.stringify(pinLocation) : null,
          gardenType || null,
          experienceLevel || null,
          gardenSpace || null,
          plantsMaintain || null,
          sharingPreference || null,
          safetyDeclaration || null,
          image || null,
        ],
        type: QueryTypes.SELECT,
      }
    );

    const newOnboarding = Array.isArray(newOnboardingResult) && newOnboardingResult.length > 0
      ? (newOnboardingResult[0] as OnboardingRecord)
      : null;

    if (!newOnboarding) {
      throw { statusCode: 500, message: "Failed to create onboarding" };
    }

    onboardingData = newOnboarding;
  }

  return onboardingData;
};

export const completeOnboarding = async (userId: string) => {
  // Update user's is_onboarded flag
  await sequelize.query(
    `UPDATE users SET is_onboarded = true WHERE id = $1`,
    { bind: [userId], type: QueryTypes.UPDATE }
  );

  // Get user data for new token
  const userResult = await sequelize.query(
    `SELECT id, email, is_onboarded FROM users WHERE id = $1 LIMIT 1`,
    { bind: [userId], type: QueryTypes.SELECT }
  );

  const user = Array.isArray(userResult) && userResult.length > 0
    ? (userResult[0] as UserRecord)
    : null;

  if (!user) {
    throw { statusCode: 404, message: "User not found" };
  }

  // Generate new token with updated isOnboarded
  const token = generateToken({
    userId: user.id,
    email: user.email,
    isOnboarded: true,
  });

  return { token, user };
};

import { QueryTypes } from "sequelize";
import sequelize from "database";

export interface UpdateUserPremiumParams {
  email: string;
  isPremium: boolean;
}

export const updateUserPremiumService = async (
  params: UpdateUserPremiumParams
): Promise<void> => {
  const { email, isPremium } = params;

  // Check if user exists
  const userRows = await sequelize.query(
    `SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL LIMIT 1`,
    { bind: [email], type: QueryTypes.SELECT }
  ) as { id: string }[];

  if (userRows.length === 0) {
    throw { statusCode: 404, message: "User not found with this email" };
  }

  // Update subscription plan
  const subscriptionPlan = isPremium ? "PREMIUM" : "FREE";
  await sequelize.query(
    `UPDATE users 
     SET subscription_plan = $1, updated_at = NOW()
     WHERE email = $2 AND deleted_at IS NULL`,
    { bind: [subscriptionPlan, email], type: QueryTypes.UPDATE }
  );
};


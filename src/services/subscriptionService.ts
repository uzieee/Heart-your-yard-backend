import { QueryTypes } from "sequelize";
import sequelize from "database";

export type SubscriptionPlan = "FREE" | "PREMIUM";

interface SubscriptionRow {
  subscription_plan: SubscriptionPlan;
}

/** Ensure that the given user has an active PREMIUM subscription plan. */
export const assertPremiumUser = async (userId: string): Promise<void> => {
  const rows = (await sequelize.query(
    `SELECT subscription_plan 
     FROM users 
     WHERE id = $1 AND deleted_at IS NULL 
     LIMIT 1`,
    {
      bind: [userId],
      type: QueryTypes.SELECT,
    }
  )) as SubscriptionRow[];

  const row = rows[0];
  if (!row) {
    throw { statusCode: 404, message: "User not found" };
  }

  if (row.subscription_plan !== "PREMIUM") {
    throw {
      statusCode: 403,
      message: "Messages is a premium feature. Please upgrade this account to use messaging.",
    };
  }
};


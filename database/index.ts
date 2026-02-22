import { Dialect, Sequelize } from "sequelize";
import dotenv from "dotenv";

dotenv.config();

const getSequelizeInstance = (): Sequelize => {
  return new Sequelize({
    database: process.env.DB_NAME!,
    username: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    host: process.env.DB_HOST!,
    dialect: "postgres" as Dialect,
    logging: false,
  });
};

const sequelize = getSequelizeInstance();

export const checkDBConnection = async (): Promise<void> => {
  try {
    await sequelize.authenticate();
    console.log("✅ Database connection established successfully.");
  } catch (error) {
    console.error("❌ Unable to connect to the database:", error);
    process.exit(1);
  }
};

export default sequelize;

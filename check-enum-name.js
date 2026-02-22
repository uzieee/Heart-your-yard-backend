require("dotenv").config();
const { Sequelize } = require("sequelize");

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    dialect: "postgres",
    logging: false,
  }
);

async function checkEnumName() {
  try {
    // Check what enum type the column actually uses
    const [columnInfo] = await sequelize.query(`
      SELECT 
        data_type,
        udt_name
      FROM information_schema.columns 
      WHERE table_name = 'notifications' 
      AND column_name = 'type';
    `);
    
    console.log("Column type info:", columnInfo);
    
    // Check all enum types
    const [enumTypes] = await sequelize.query(`
      SELECT typname 
      FROM pg_type 
      WHERE typtype = 'e' 
      AND typname LIKE '%notification%';
    `);
    
    console.log("\nAll notification-related enum types:");
    enumTypes.forEach(e => console.log(`  - ${e.typname}`));
    
    await sequelize.close();
  } catch (error) {
    console.error("❌ Error:", error.message);
    await sequelize.close();
    process.exit(1);
  }
}

checkEnumName();


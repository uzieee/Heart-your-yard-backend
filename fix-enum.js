require("dotenv").config();
const { Sequelize } = require("sequelize");

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    dialect: "postgres",
    logging: console.log,
  }
);

async function fixEnum() {
  try {
    console.log("🔧 Fixing notification enum types...");
    
    // Add FRIEND_REQUEST_SENT
    await sequelize.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_enum 
          WHERE enumlabel = 'FRIEND_REQUEST_SENT' 
          AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notification_type_enum')
        ) THEN
          ALTER TYPE notification_type_enum ADD VALUE 'FRIEND_REQUEST_SENT';
          RAISE NOTICE 'Added FRIEND_REQUEST_SENT to enum';
        ELSE
          RAISE NOTICE 'FRIEND_REQUEST_SENT already exists';
        END IF;
      END $$;
    `);
    
    // Add FRIEND_REQUEST_ACCEPTED
    await sequelize.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_enum 
          WHERE enumlabel = 'FRIEND_REQUEST_ACCEPTED' 
          AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notification_type_enum')
        ) THEN
          ALTER TYPE notification_type_enum ADD VALUE 'FRIEND_REQUEST_ACCEPTED';
          RAISE NOTICE 'Added FRIEND_REQUEST_ACCEPTED to enum';
        ELSE
          RAISE NOTICE 'FRIEND_REQUEST_ACCEPTED already exists';
        END IF;
      END $$;
    `);
    
    // Verify
    const [results] = await sequelize.query(`
      SELECT enumlabel 
      FROM pg_enum 
      WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notification_type_enum')
      ORDER BY enumsortorder;
    `);
    
    console.log("✅ Enum values:", results.map(r => r.enumlabel));
    console.log("✅ Enum fix completed!");
    
    await sequelize.close();
  } catch (error) {
    console.error("❌ Error fixing enum:", error);
    process.exit(1);
  }
}

fixEnum();


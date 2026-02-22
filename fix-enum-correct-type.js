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
    console.log("🔧 Fixing notification enum types (correct type: enum_notifications_type)...");
    
    // Add FRIEND_REQUEST_SENT to the correct enum type
    await sequelize.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_enum 
          WHERE enumlabel = 'FRIEND_REQUEST_SENT' 
          AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'enum_notifications_type')
        ) THEN
          ALTER TYPE enum_notifications_type ADD VALUE 'FRIEND_REQUEST_SENT';
          RAISE NOTICE 'Added FRIEND_REQUEST_SENT to enum_notifications_type';
        ELSE
          RAISE NOTICE 'FRIEND_REQUEST_SENT already exists in enum_notifications_type';
        END IF;
      END $$;
    `);
    
    // Add FRIEND_REQUEST_ACCEPTED to the correct enum type
    await sequelize.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_enum 
          WHERE enumlabel = 'FRIEND_REQUEST_ACCEPTED' 
          AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'enum_notifications_type')
        ) THEN
          ALTER TYPE enum_notifications_type ADD VALUE 'FRIEND_REQUEST_ACCEPTED';
          RAISE NOTICE 'Added FRIEND_REQUEST_ACCEPTED to enum_notifications_type';
        ELSE
          RAISE NOTICE 'FRIEND_REQUEST_ACCEPTED already exists in enum_notifications_type';
        END IF;
      END $$;
    `);
    
    // Verify
    const [results] = await sequelize.query(`
      SELECT enumlabel 
      FROM pg_enum 
      WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'enum_notifications_type')
      ORDER BY enumsortorder;
    `);
    
    console.log("✅ Enum values in enum_notifications_type:", results.map(r => r.enumlabel));
    console.log("✅ Enum fix completed!");
    
    await sequelize.close();
  } catch (error) {
    console.error("❌ Error fixing enum:", error);
    process.exit(1);
  }
}

fixEnum();


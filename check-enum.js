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

async function checkEnum() {
  try {
    const [results] = await sequelize.query(`
      SELECT enumlabel 
      FROM pg_enum 
      WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notification_type_enum')
      ORDER BY enumsortorder;
    `);
    
    console.log("Current enum values in database:");
    results.forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.enumlabel}`);
    });
    
    const hasFriendRequestSent = results.some(r => r.enumlabel === 'FRIEND_REQUEST_SENT');
    const hasFriendRequestAccepted = results.some(r => r.enumlabel === 'FRIEND_REQUEST_ACCEPTED');
    
    console.log("\nStatus:");
    console.log(`  FRIEND_REQUEST_SENT: ${hasFriendRequestSent ? '✅ EXISTS' : '❌ MISSING'}`);
    console.log(`  FRIEND_REQUEST_ACCEPTED: ${hasFriendRequestAccepted ? '✅ EXISTS' : '❌ MISSING'}`);
    
    if (!hasFriendRequestSent || !hasFriendRequestAccepted) {
      console.log("\n⚠️ Enum values are missing! Running fix-enum.js...");
      await sequelize.close();
      const { exec } = require('child_process');
      exec('node fix-enum.js', (error, stdout, stderr) => {
        if (error) {
          console.error(`Error: ${error.message}`);
          return;
        }
        console.log(stdout);
        if (stderr) console.error(stderr);
      });
    } else {
      console.log("\n✅ All enum values are present!");
      console.log("⚠️ If server is still showing error, RESTART THE SERVER!");
    }
    
    await sequelize.close();
  } catch (error) {
    console.error("❌ Error checking enum:", error.message);
    await sequelize.close();
    process.exit(1);
  }
}

checkEnum();


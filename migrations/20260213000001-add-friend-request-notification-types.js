'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // Add new notification types to the enum
    // Note: PostgreSQL doesn't support IF NOT EXISTS for ALTER TYPE ADD VALUE
    // We need to use a DO block to handle errors gracefully
    await queryInterface.sequelize.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_enum 
          WHERE enumlabel = 'FRIEND_REQUEST_SENT' 
          AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notification_type_enum')
        ) THEN
          ALTER TYPE notification_type_enum ADD VALUE 'FRIEND_REQUEST_SENT';
        END IF;
      END $$;
    `);
    
    await queryInterface.sequelize.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_enum 
          WHERE enumlabel = 'FRIEND_REQUEST_ACCEPTED' 
          AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notification_type_enum')
        ) THEN
          ALTER TYPE notification_type_enum ADD VALUE 'FRIEND_REQUEST_ACCEPTED';
        END IF;
      END $$;
    `);
  },

  async down (queryInterface, Sequelize) {
    // Note: PostgreSQL doesn't support removing enum values directly
    // This would require recreating the enum type, which is complex
    // For now, we'll leave the enum values in place
    console.log('Note: Removing enum values requires recreating the enum type');
  }
};


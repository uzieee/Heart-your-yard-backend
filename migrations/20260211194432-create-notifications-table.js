'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // Create ENUM types for notification type and reference type
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE notification_type_enum AS ENUM (
          'POST_CREATED', 
          'POST_LIKED', 
          'COMMENT_ADDED', 
          'COMMENT_LIKED', 
          'REPLY_ADDED', 
          'REPLY_LIKED',
          'USER_FOLLOWED'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE reference_type_enum AS ENUM ('POST', 'COMMENT', 'REPLY', 'USER');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryInterface.createTable('notifications', {
      id: {
        allowNull: false,
        primaryKey: true,
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("uuid_generate_v4()"),
        unique: true,
      },
      user_id: {
        allowNull: false,
        type: Sequelize.UUID,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        comment: 'User who receives the notification',
      },
      actor_id: {
        allowNull: false,
        type: Sequelize.UUID,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        comment: 'User who performed the action',
      },
      type: {
        allowNull: false,
        type: Sequelize.ENUM(
          'POST_CREATED', 
          'POST_LIKED', 
          'COMMENT_ADDED', 
          'COMMENT_LIKED', 
          'REPLY_ADDED', 
          'REPLY_LIKED',
          'USER_FOLLOWED'
        ),
      },
      reference_id: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: 'ID of the related post, comment, reply, or user',
      },
      reference_type: {
        allowNull: false,
        type: Sequelize.ENUM('POST', 'COMMENT', 'REPLY', 'USER'),
      },
      message: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Notification message',
      },
      is_read: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn("NOW"),
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn("NOW"),
      },
      deleted_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
    });

    // Add indexes for faster lookups
    await queryInterface.addIndex('notifications', ['user_id'], {
      name: 'notifications_user_id_idx'
    });
    await queryInterface.addIndex('notifications', ['actor_id'], {
      name: 'notifications_actor_id_idx'
    });
    await queryInterface.addIndex('notifications', ['is_read'], {
      name: 'notifications_is_read_idx'
    });
    await queryInterface.addIndex('notifications', ['created_at'], {
      name: 'notifications_created_at_idx'
    });
    await queryInterface.addIndex('notifications', ['type'], {
      name: 'notifications_type_idx'
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.dropTable('notifications');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS notification_type_enum;');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS reference_type_enum;');
  }
};

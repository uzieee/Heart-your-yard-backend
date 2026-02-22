'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('messages', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      sender_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      receiver_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      content: {
        type: Sequelize.TEXT,
        allowNull: true, // Allow null for media-only messages
      },
      message_type: {
        type: Sequelize.ENUM('text', 'image', 'video'),
        allowNull: false,
        defaultValue: 'text',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    // Create indexes for better query performance
    await queryInterface.addIndex('messages', ['sender_id'], {
      name: 'idx_messages_sender_id',
    });
    await queryInterface.addIndex('messages', ['receiver_id'], {
      name: 'idx_messages_receiver_id',
    });
    await queryInterface.addIndex('messages', ['created_at'], {
      name: 'idx_messages_created_at',
    });
    // Composite index for conversation queries
    await queryInterface.addIndex('messages', ['sender_id', 'receiver_id', 'created_at'], {
      name: 'idx_messages_conversation',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('messages');
  }
};


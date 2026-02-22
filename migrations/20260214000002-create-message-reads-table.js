'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('message_reads', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      message_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'messages',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      read_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    // Create unique index to prevent duplicate reads
    await queryInterface.addIndex('message_reads', ['message_id', 'user_id'], {
      unique: true,
      name: 'idx_message_reads_unique',
    });
    await queryInterface.addIndex('message_reads', ['user_id'], {
      name: 'idx_message_reads_user_id',
    });
    await queryInterface.addIndex('message_reads', ['read_at'], {
      name: 'idx_message_reads_read_at',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('message_reads');
  }
};


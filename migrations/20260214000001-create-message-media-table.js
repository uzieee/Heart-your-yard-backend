'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('message_media', {
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
      media_url: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      media_type: {
        type: Sequelize.ENUM('image', 'video'),
        allowNull: false,
      },
      file_name: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      file_size: {
        type: Sequelize.BIGINT,
        allowNull: true,
        comment: 'File size in bytes',
      },
      mime_type: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'MIME type of the file',
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

    // Create index for message_id
    await queryInterface.addIndex('message_media', ['message_id'], {
      name: 'idx_message_media_message_id',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('message_media');
  }
};


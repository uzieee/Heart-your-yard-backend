'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // Create ENUM type for media_type (only if it doesn't exist)
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE media_type_enum AS ENUM ('VIDEO', 'IMAGE');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryInterface.createTable('post_media', {
      id: {
        allowNull: false,
        primaryKey: true,
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("uuid_generate_v4()"),
        unique: true,
      },
      post_id: {
        allowNull: false,
        type: Sequelize.UUID,
        references: {
          model: 'posts',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      media_type: {
        allowNull: false,
        type: Sequelize.ENUM('VIDEO', 'IMAGE'),
      },
      media_url: {
        allowNull: false,
        type: Sequelize.STRING,
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

    // Add indexes
    await queryInterface.addIndex('post_media', ['post_id'], {
      name: 'post_media_post_id_idx'
    });
    await queryInterface.addIndex('post_media', ['media_type'], {
      name: 'post_media_media_type_idx'
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.dropTable('post_media');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS media_type_enum;');
  }
};

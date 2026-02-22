'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('community_post_media', {
      id: {
        allowNull: false,
        primaryKey: true,
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('uuid_generate_v4()'),
        unique: true,
      },
      community_post_id: {
        allowNull: false,
        type: Sequelize.UUID,
        references: {
          model: 'community_posts',
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
        defaultValue: Sequelize.fn('NOW'),
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn('NOW'),
      },
      deleted_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
    });

    await queryInterface.addIndex('community_post_media', ['community_post_id'], {
      name: 'community_post_media_post_id_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('community_post_media', 'community_post_media_post_id_idx');
    await queryInterface.dropTable('community_post_media');
  },
};

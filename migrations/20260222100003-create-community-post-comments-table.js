'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('community_post_comments', {
      id: {
        allowNull: false,
        primaryKey: true,
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('uuid_generate_v4()'),
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
      message: {
        allowNull: false,
        type: Sequelize.TEXT,
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

    await queryInterface.addIndex('community_post_comments', ['user_id'], {
      name: 'community_post_comments_user_id_idx',
    });
    await queryInterface.addIndex('community_post_comments', ['community_post_id'], {
      name: 'community_post_comments_post_id_idx',
    });
    await queryInterface.addIndex('community_post_comments', ['created_at'], {
      name: 'community_post_comments_created_at_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('community_post_comments', 'community_post_comments_user_id_idx');
    await queryInterface.removeIndex('community_post_comments', 'community_post_comments_post_id_idx');
    await queryInterface.removeIndex('community_post_comments', 'community_post_comments_created_at_idx');
    await queryInterface.dropTable('community_post_comments');
  },
};

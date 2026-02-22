'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('community_post_likes', {
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
      reaction_type: {
        allowNull: false,
        type: Sequelize.ENUM('LIKE', 'DISLIKE', 'NONE'),
        defaultValue: 'LIKE',
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

    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX community_post_likes_user_post_unique_idx
      ON community_post_likes (user_id, community_post_id)
      WHERE deleted_at IS NULL;
    `);
    await queryInterface.addIndex('community_post_likes', ['user_id'], {
      name: 'community_post_likes_user_id_idx',
    });
    await queryInterface.addIndex('community_post_likes', ['community_post_id'], {
      name: 'community_post_likes_post_id_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      'DROP INDEX IF EXISTS community_post_likes_user_post_unique_idx;'
    );
    await queryInterface.removeIndex('community_post_likes', 'community_post_likes_user_id_idx');
    await queryInterface.removeIndex('community_post_likes', 'community_post_likes_post_id_idx');
    await queryInterface.dropTable('community_post_likes');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_community_post_likes_reaction_type";');
  },
};

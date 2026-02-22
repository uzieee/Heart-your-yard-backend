'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('post_likes', {
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

    // Add unique index to prevent duplicate likes
    await queryInterface.addIndex('post_likes', ['user_id', 'post_id'], {
      name: 'post_likes_user_post_unique_idx',
      unique: true,
      where: {
        deleted_at: null
      }
    });

    // Add indexes
    await queryInterface.addIndex('post_likes', ['user_id'], {
      name: 'post_likes_user_id_idx'
    });
    await queryInterface.addIndex('post_likes', ['post_id'], {
      name: 'post_likes_post_id_idx'
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.dropTable('post_likes');
  }
};

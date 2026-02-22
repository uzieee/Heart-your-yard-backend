'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('community_posts', {
      id: {
        allowNull: false,
        primaryKey: true,
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('uuid_generate_v4()'),
        unique: true,
      },
      community_id: {
        allowNull: false,
        type: Sequelize.UUID,
        references: {
          model: 'communities',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
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
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      location: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      location_coordinates: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      planting_schedule_date: {
        type: Sequelize.DATE,
        allowNull: true,
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

    await queryInterface.addIndex('community_posts', ['community_id'], {
      name: 'community_posts_community_id_idx',
    });
    await queryInterface.addIndex('community_posts', ['user_id'], {
      name: 'community_posts_user_id_idx',
    });
    await queryInterface.addIndex('community_posts', ['created_at'], {
      name: 'community_posts_created_at_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('community_posts', 'community_posts_community_id_idx');
    await queryInterface.removeIndex('community_posts', 'community_posts_user_id_idx');
    await queryInterface.removeIndex('community_posts', 'community_posts_created_at_idx');
    await queryInterface.dropTable('community_posts');
  },
};

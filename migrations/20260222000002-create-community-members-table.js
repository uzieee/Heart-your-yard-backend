'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('community_members', {
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
      role: {
        allowNull: false,
        type: Sequelize.ENUM('ADMIN', 'MEMBER'),
        defaultValue: 'MEMBER',
      },
      joined_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn('NOW'),
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
      CREATE UNIQUE INDEX community_members_community_user_unique_idx
      ON community_members (community_id, user_id)
      WHERE deleted_at IS NULL;
    `);

    await queryInterface.addIndex('community_members', ['community_id'], {
      name: 'community_members_community_id_idx',
    });
    await queryInterface.addIndex('community_members', ['user_id'], {
      name: 'community_members_user_id_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      'DROP INDEX IF EXISTS community_members_community_user_unique_idx;'
    );
    await queryInterface.removeIndex('community_members', 'community_members_community_id_idx');
    await queryInterface.removeIndex('community_members', 'community_members_user_id_idx');
    await queryInterface.dropTable('community_members');
  },
};

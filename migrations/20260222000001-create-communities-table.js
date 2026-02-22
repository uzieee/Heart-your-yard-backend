'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('communities', {
      id: {
        allowNull: false,
        primaryKey: true,
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('uuid_generate_v4()'),
        unique: true,
      },
      name: {
        allowNull: false,
        type: Sequelize.STRING(255),
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      image: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      created_by: {
        allowNull: false,
        type: Sequelize.UUID,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
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

    await queryInterface.addIndex('communities', ['created_by'], {
      name: 'communities_created_by_idx',
    });
    await queryInterface.addIndex('communities', ['name'], {
      name: 'communities_name_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('communities', 'communities_created_by_idx');
    await queryInterface.removeIndex('communities', 'communities_name_idx');
    await queryInterface.dropTable('communities');
  },
};

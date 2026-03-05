'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('planting_tasks', {
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
      title: {
        allowNull: false,
        type: Sequelize.STRING(200),
      },
      details: {
        allowNull: true,
        type: Sequelize.TEXT,
      },
      start_date: {
        allowNull: false,
        type: Sequelize.DATEONLY,
      },
      due_date: {
        allowNull: false,
        type: Sequelize.DATEONLY,
      },
      image_url: {
        allowNull: true,
        type: Sequelize.TEXT,
      },
      status: {
        allowNull: false,
        type: Sequelize.STRING(30),
        defaultValue: 'NOT_STARTED',
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

    await queryInterface.addIndex('planting_tasks', ['user_id', 'created_at'], {
      name: 'planting_tasks_user_id_created_at_idx',
    });
    await queryInterface.addIndex('planting_tasks', ['start_date', 'due_date'], {
      name: 'planting_tasks_date_range_idx',
    });
    await queryInterface.addIndex('planting_tasks', ['status'], {
      name: 'planting_tasks_status_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('planting_tasks');
  },
};


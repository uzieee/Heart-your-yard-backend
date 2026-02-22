'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('onboarding', {
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
        unique: true,
      },
      date_of_birth: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      address: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      pin_location: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      garden_type: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      experience_level: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      garden_space: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      plants_maintain: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      sharing_preference: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      safety_declaration: {
        type: Sequelize.BOOLEAN,
        allowNull: true,
      },
      image: {
        type: Sequelize.TEXT,
        allowNull: true,
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

    // Add index for faster lookups
    await queryInterface.addIndex('onboarding', ['user_id'], {
      name: 'onboarding_user_id_idx'
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.dropTable('onboarding');
  }
};

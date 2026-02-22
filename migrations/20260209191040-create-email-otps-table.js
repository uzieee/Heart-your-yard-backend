'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('email_otps', {
      id: {
        allowNull: false,
        primaryKey: true,
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("uuid_generate_v4()"),
        unique: true,
      },
      email: {
        allowNull: false,
        type: Sequelize.STRING,
      },
      otp: {
        allowNull: false,
        type: Sequelize.STRING(6),
      },
      expires_at: {
        allowNull: false,
        type: Sequelize.DATE,
      },
      is_used: {
        allowNull: false,
        type: Sequelize.BOOLEAN,
        defaultValue: false,
      },
      attempts: {
        allowNull: false,
        type: Sequelize.INTEGER,
        defaultValue: 0,
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
    });

    // Add index for faster lookups
    await queryInterface.addIndex('email_otps', ['email', 'is_used', 'expires_at'], {
      name: 'email_otps_lookup_idx'
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.dropTable('email_otps');
  }
};

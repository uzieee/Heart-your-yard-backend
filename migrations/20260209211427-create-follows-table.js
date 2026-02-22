'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('follows', {
      id: {
        allowNull: false,
        primaryKey: true,
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("uuid_generate_v4()"),
        unique: true,
      },
      follower_id: {
        allowNull: false,
        type: Sequelize.UUID,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      following_id: {
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

    // Add unique constraint to prevent duplicate follows (only for non-deleted records)
    // Using a partial unique index for PostgreSQL
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX follows_follower_following_unique_idx 
      ON follows (follower_id, following_id) 
      WHERE deleted_at IS NULL;
    `);

    // Add indexes for faster lookups
    await queryInterface.addIndex('follows', ['follower_id'], {
      name: 'follows_follower_id_idx',
    });

    await queryInterface.addIndex('follows', ['following_id'], {
      name: 'follows_following_id_idx',
    });
  },

  async down (queryInterface, Sequelize) {
    // Drop indexes first
    await queryInterface.removeIndex('follows', 'follows_follower_following_unique_idx');
    await queryInterface.removeIndex('follows', 'follows_follower_id_idx');
    await queryInterface.removeIndex('follows', 'follows_following_id_idx');
    
    // Drop table
    await queryInterface.dropTable('follows');
  }
};

'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('friend_requests', {
      id: {
        allowNull: false,
        primaryKey: true,
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("uuid_generate_v4()"),
        unique: true,
      },
      requester_id: {
        allowNull: false,
        type: Sequelize.UUID,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        comment: 'User who sent the friend request',
      },
      receiver_id: {
        allowNull: false,
        type: Sequelize.UUID,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        comment: 'User who received the friend request',
      },
      status: {
        allowNull: false,
        type: Sequelize.ENUM('PENDING', 'ACCEPTED', 'DECLINED'),
        defaultValue: 'PENDING',
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

    // Add unique constraint to prevent duplicate friend requests (only for non-deleted records)
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX friend_requests_requester_receiver_unique_idx 
      ON friend_requests (requester_id, receiver_id) 
      WHERE deleted_at IS NULL;
    `);

    // Add indexes for faster lookups
    await queryInterface.addIndex('friend_requests', ['requester_id'], {
      name: 'friend_requests_requester_id_idx',
    });

    await queryInterface.addIndex('friend_requests', ['receiver_id'], {
      name: 'friend_requests_receiver_id_idx',
    });

    await queryInterface.addIndex('friend_requests', ['status'], {
      name: 'friend_requests_status_idx',
    });
  },

  async down (queryInterface, Sequelize) {
    // Drop indexes first
    await queryInterface.removeIndex('friend_requests', 'friend_requests_requester_receiver_unique_idx');
    await queryInterface.removeIndex('friend_requests', 'friend_requests_requester_id_idx');
    await queryInterface.removeIndex('friend_requests', 'friend_requests_receiver_id_idx');
    await queryInterface.removeIndex('friend_requests', 'friend_requests_status_idx');
    
    // Drop table
    await queryInterface.dropTable('friend_requests');
  }
};


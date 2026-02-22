'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add parent_reply_id column to comments_replies table for nested replies
    await queryInterface.addColumn('comments_replies', 'parent_reply_id', {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: 'comments_replies',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    });

    // Add index for parent_reply_id
    await queryInterface.addIndex('comments_replies', ['parent_reply_id'], {
      name: 'comments_replies_parent_reply_id_idx'
    });
  },

  async down(queryInterface, Sequelize) {
    // Remove index
    await queryInterface.removeIndex('comments_replies', 'comments_replies_parent_reply_id_idx');
    
    // Remove column
    await queryInterface.removeColumn('comments_replies', 'parent_reply_id');
  }
};

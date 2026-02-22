'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // 1. Add reaction_type column
    await queryInterface.addColumn('post_likes', 'reaction_type', {
      type: Sequelize.ENUM('LIKE', 'DISLIKE', 'NONE'),
      defaultValue: 'LIKE', // Default to LIKE for existing rows
      allowNull: false,
    });

    // 2. We need to update the unique index to include reaction_type or just rely on user_id + post_id uniqueness?
    // Actually, a user can only have ONE reaction (either LIKE or DISLIKE) per post.
    // So the existing unique index on [user_id, post_id] is still valid and correct.
    // We don't need to change the index.
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('post_likes', 'reaction_type');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_post_likes_reaction_type";');
  }
};

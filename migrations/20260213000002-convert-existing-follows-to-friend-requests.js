'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // Convert existing follows to accepted friend requests
    // For each follow relationship, create a friend request with ACCEPTED status
    // We create it from the follower's perspective (follower requested, following accepted)
    
    await queryInterface.sequelize.query(`
      INSERT INTO friend_requests (id, requester_id, receiver_id, status, created_at, updated_at)
      SELECT 
        uuid_generate_v4() as id,
        follower_id as requester_id,
        following_id as receiver_id,
        'ACCEPTED' as status,
        created_at,
        updated_at
      FROM follows
      WHERE deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM friend_requests fr
        WHERE fr.requester_id = follows.follower_id
        AND fr.receiver_id = follows.following_id
        AND fr.deleted_at IS NULL
      );
    `);

    console.log('✅ Converted existing follows to accepted friend requests');
  },

  async down (queryInterface, Sequelize) {
    // Remove friend requests that were created from existing follows
    // This is tricky because we don't have a way to identify which ones were migrated
    // So we'll just remove all ACCEPTED friend requests that match existing follows
    await queryInterface.sequelize.query(`
      UPDATE friend_requests
      SET deleted_at = NOW()
      WHERE status = 'ACCEPTED'
      AND EXISTS (
        SELECT 1 FROM follows f
        WHERE (
          (f.follower_id = friend_requests.requester_id AND f.following_id = friend_requests.receiver_id)
          OR
          (f.follower_id = friend_requests.receiver_id AND f.following_id = friend_requests.requester_id)
        )
        AND f.deleted_at IS NULL
      )
      AND friend_requests.deleted_at IS NULL;
    `);

    console.log('⚠️ Removed friend requests that were created from existing follows');
  }
};


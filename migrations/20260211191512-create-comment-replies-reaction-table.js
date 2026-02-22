'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // Create ENUM type for reaction_type (only if it doesn't exist)
    // Note: This table uses the same reaction_type_enum as comment_reaction
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE reaction_type_enum AS ENUM ('LIKE', 'DISLIKE', 'NONE');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryInterface.createTable('comment_replies_reaction', {
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
      comment_reply_id: {
        allowNull: false,
        type: Sequelize.UUID,
        references: {
          model: 'comments_replies',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      reaction_type: {
        allowNull: false,
        type: Sequelize.ENUM('LIKE', 'DISLIKE', 'NONE'),
        defaultValue: 'NONE',
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

    // Add unique index to prevent duplicate reactions
    await queryInterface.addIndex('comment_replies_reaction', ['user_id', 'comment_reply_id'], {
      name: 'comment_replies_reaction_user_reply_unique_idx',
      unique: true,
      where: {
        deleted_at: null
      }
    });

    // Add indexes
    await queryInterface.addIndex('comment_replies_reaction', ['user_id'], {
      name: 'comment_replies_reaction_user_id_idx'
    });
    await queryInterface.addIndex('comment_replies_reaction', ['comment_reply_id'], {
      name: 'comment_replies_reaction_reply_id_idx'
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.dropTable('comment_replies_reaction');
  }
};

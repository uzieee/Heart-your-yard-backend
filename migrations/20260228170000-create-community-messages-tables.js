"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("community_messages", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        allowNull: false,
        primaryKey: true,
      },
      community_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "communities", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      sender_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      content: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("NOW()"),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("NOW()"),
      },
      deleted_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
    });

    await queryInterface.addIndex("community_messages", ["community_id", "created_at"], {
      name: "community_messages_community_created_idx",
    });

    await queryInterface.createTable("community_message_reads", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        allowNull: false,
        primaryKey: true,
      },
      message_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "community_messages", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      read_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("NOW()"),
      },
    });

    await queryInterface.addIndex("community_message_reads", ["message_id", "user_id"], {
      unique: true,
      name: "community_message_reads_unique_idx",
    });
    await queryInterface.addIndex("community_message_reads", ["user_id"], {
      name: "community_message_reads_user_idx",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("community_message_reads", "community_message_reads_user_idx");
    await queryInterface.removeIndex("community_message_reads", "community_message_reads_unique_idx");
    await queryInterface.dropTable("community_message_reads");

    await queryInterface.removeIndex("community_messages", "community_messages_community_created_idx");
    await queryInterface.dropTable("community_messages");
  },
};



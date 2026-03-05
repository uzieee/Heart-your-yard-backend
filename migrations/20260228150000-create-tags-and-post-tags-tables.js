'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('tags', {
      id: {
        allowNull: false,
        primaryKey: true,
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("uuid_generate_v4()"),
        unique: true,
      },
      name: {
        allowNull: false,
        type: Sequelize.STRING(100),
        unique: true,
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
        allowNull: true,
        type: Sequelize.DATE,
      },
    });

    await queryInterface.createTable('post_tags', {
      id: {
        allowNull: false,
        primaryKey: true,
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal("uuid_generate_v4()"),
        unique: true,
      },
      post_id: {
        allowNull: false,
        type: Sequelize.UUID,
        references: {
          model: 'posts',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      tag_id: {
        allowNull: false,
        type: Sequelize.UUID,
        references: {
          model: 'tags',
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
        allowNull: true,
        type: Sequelize.DATE,
      },
    });

    await queryInterface.addIndex('tags', ['name'], {
      unique: true,
      name: 'tags_name_unique_idx',
    });
    await queryInterface.addIndex('post_tags', ['post_id'], {
      name: 'post_tags_post_id_idx',
    });
    await queryInterface.addIndex('post_tags', ['tag_id'], {
      name: 'post_tags_tag_id_idx',
    });
    await queryInterface.addIndex('post_tags', ['post_id', 'tag_id'], {
      unique: true,
      name: 'post_tags_post_id_tag_id_unique_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('post_tags');
    await queryInterface.dropTable('tags');
  },
};


'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add date fields if missing (for DBs where initial migration already ran).
    await queryInterface.sequelize.query(`
      ALTER TABLE planting_tasks
      ADD COLUMN IF NOT EXISTS start_date DATE,
      ADD COLUMN IF NOT EXISTS due_date DATE,
      ADD COLUMN IF NOT EXISTS image_url TEXT
    `);

    // Backfill dates for existing records.
    await queryInterface.sequelize.query(`
      UPDATE planting_tasks
      SET
        start_date = COALESCE(start_date, created_at::date),
        due_date = COALESCE(due_date, created_at::date)
      WHERE deleted_at IS NULL
    `);

    // Enforce required dates.
    await queryInterface.sequelize.query(`
      ALTER TABLE planting_tasks
      ALTER COLUMN start_date SET NOT NULL,
      ALTER COLUMN due_date SET NOT NULL
    `);

    // Some environments may still have old post_id design; drop it safely.
    await queryInterface.sequelize.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'planting_tasks' AND column_name = 'post_id'
        ) THEN
          ALTER TABLE planting_tasks DROP COLUMN post_id;
        END IF;
      END $$;
    `);

    // Date range index for scheduler/status checks (safe for reruns).
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS planting_tasks_date_range_idx
      ON planting_tasks (start_date, due_date)
    `);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS planting_tasks_date_range_idx
    `);
    // Keep columns in down for safety with existing data and compatibility.
  },
};


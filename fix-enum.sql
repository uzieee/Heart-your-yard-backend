-- Fix enum values for notification types
-- Run this directly in PostgreSQL

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'FRIEND_REQUEST_SENT' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notification_type_enum')
  ) THEN
    ALTER TYPE notification_type_enum ADD VALUE 'FRIEND_REQUEST_SENT';
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'FRIEND_REQUEST_ACCEPTED' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notification_type_enum')
  ) THEN
    ALTER TYPE notification_type_enum ADD VALUE 'FRIEND_REQUEST_ACCEPTED';
  END IF;
END $$;

-- Verify the enum values
SELECT enumlabel 
FROM pg_enum 
WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notification_type_enum')
ORDER BY enumsortorder;


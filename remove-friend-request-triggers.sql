-- ============================================
-- REMOVE TRIGGERS THAT AUTO-CREATE FRIEND REQUESTS ON FOLLOW
-- ============================================

-- Step 1: Check for triggers on follows table
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_statement,
    action_timing
FROM information_schema.triggers
WHERE event_object_table = 'follows'
ORDER BY trigger_name;

-- Step 2: If you find any trigger that creates friend_requests, remove it
-- Example (replace <trigger_name> with actual trigger name):
-- DROP TRIGGER IF EXISTS <trigger_name> ON follows CASCADE;

-- Step 3: Check for functions that might be creating friend requests
SELECT 
    p.proname AS function_name,
    pg_get_functiondef(p.oid) AS function_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND pg_get_functiondef(p.oid) LIKE '%friend_requests%'
ORDER BY p.proname;

-- Step 4: Remove any function that auto-creates friend requests (if found)
-- DROP FUNCTION IF EXISTS <function_name> CASCADE;

-- Step 5: Verify no triggers remain
SELECT COUNT(*) as trigger_count
FROM information_schema.triggers
WHERE event_object_table = 'follows';


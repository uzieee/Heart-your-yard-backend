-- ============================================
-- CHECK FOR TRIGGERS ON FOLLOWS TABLE
-- ============================================
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_statement,
    action_timing,
    action_orientation
FROM information_schema.triggers
WHERE event_object_table = 'follows'
ORDER BY trigger_name;

-- ============================================
-- CHECK FOR FUNCTIONS THAT MIGHT CREATE FRIEND REQUESTS
-- ============================================
SELECT 
    p.proname AS function_name,
    pg_get_functiondef(p.oid) AS function_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND (
    pg_get_functiondef(p.oid) LIKE '%friend_requests%'
    OR pg_get_functiondef(p.oid) LIKE '%INSERT INTO friend_requests%'
)
ORDER BY p.proname;

-- ============================================
-- REMOVE ANY TRIGGERS ON FOLLOWS TABLE THAT CREATE FRIEND REQUESTS
-- ============================================
-- Uncomment the lines below to remove triggers (BE CAREFUL!)
-- DROP TRIGGER IF EXISTS <trigger_name> ON follows CASCADE;

-- ============================================
-- CHECK FOR CONSTRAINTS OR RULES
-- ============================================
SELECT 
    conname AS constraint_name,
    contype AS constraint_type,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'follows'::regclass
OR conrelid = 'friend_requests'::regclass;


-- Check for triggers on follows table
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_statement,
    action_timing
FROM information_schema.triggers
WHERE event_object_table = 'follows'
ORDER BY trigger_name;

-- Check for triggers on friend_requests table
SELECT 
    trigger_name,
    event_manipulation,
    event_object_table,
    action_statement,
    action_timing
FROM information_schema.triggers
WHERE event_object_table = 'friend_requests'
ORDER BY trigger_name;

-- Check for functions that might be called by triggers
SELECT 
    p.proname AS function_name,
    pg_get_functiondef(p.oid) AS function_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND (
    pg_get_functiondef(p.oid) LIKE '%friend_requests%'
    OR pg_get_functiondef(p.oid) LIKE '%follows%'
)
ORDER BY p.proname;


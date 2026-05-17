-- Migration: Cleanup overloaded increment_multi_usage functions
-- Description: Drops old overloaded versions of public.increment_multi_usage to resolve type ambiguity errors in the RPC.

DROP FUNCTION IF EXISTS public.increment_multi_usage(uuid, text, jsonb, integer, integer);
DROP FUNCTION IF EXISTS public.increment_multi_usage(uuid, text, jsonb, numeric, numeric);

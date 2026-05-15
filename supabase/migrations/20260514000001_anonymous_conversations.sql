-- ============================================================
-- Migration: Anonymous Conversations Support
-- Phase 10: Anonymous Chat Persistence
-- ============================================================

-- 1. MODIFY CONVERSATIONS TABLE
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS anon_id TEXT;
ALTER TABLE public.conversations ALTER COLUMN user_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_anon ON public.conversations(anon_id);

-- 2. UPDATE CONVERSATIONS RLS POLICIES
DROP POLICY IF EXISTS "Users can create their own conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can delete their own conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can update their own conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can view their own conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can view own conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can create own conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can update own conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can delete own conversations" ON public.conversations;

CREATE POLICY "Users can view own conversations" ON public.conversations
  FOR SELECT USING (
    (auth.uid() = user_id) OR 
    (anon_id = current_setting('request.headers', true)::json->>'x-anon-id')
  );

CREATE POLICY "Users can create own conversations" ON public.conversations
  FOR INSERT WITH CHECK (
    (auth.uid() = user_id) OR 
    (anon_id = current_setting('request.headers', true)::json->>'x-anon-id')
  );

CREATE POLICY "Users can update own conversations" ON public.conversations
  FOR UPDATE USING (
    (auth.uid() = user_id) OR 
    (anon_id = current_setting('request.headers', true)::json->>'x-anon-id')
  );

CREATE POLICY "Users can delete own conversations" ON public.conversations
  FOR DELETE USING (
    (auth.uid() = user_id) OR 
    (anon_id = current_setting('request.headers', true)::json->>'x-anon-id')
  );

-- 3. UPDATE MESSAGES RLS POLICIES
DROP POLICY IF EXISTS "Users can view messages in their conversations" ON public.messages;
DROP POLICY IF EXISTS "Users can insert messages into their conversations" ON public.messages;
DROP POLICY IF EXISTS "Users can delete messages in their conversations" ON public.messages;

CREATE POLICY "Users can view messages in their conversations" ON public.messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM conversations 
      WHERE conversations.id = messages.conversation_id 
      AND (
        (conversations.user_id = auth.uid()) OR 
        (conversations.anon_id = current_setting('request.headers', true)::json->>'x-anon-id')
      )
    )
  );

CREATE POLICY "Users can insert messages into their conversations" ON public.messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations 
      WHERE conversations.id = messages.conversation_id 
      AND (
        (conversations.user_id = auth.uid()) OR 
        (conversations.anon_id = current_setting('request.headers', true)::json->>'x-anon-id')
      )
    )
  );

CREATE POLICY "Users can delete messages in their conversations" ON public.messages
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM conversations 
      WHERE conversations.id = messages.conversation_id 
      AND (
        (conversations.user_id = auth.uid()) OR 
        (conversations.anon_id = current_setting('request.headers', true)::json->>'x-anon-id')
      )
    )
  );

-- 4. SERVICE ROLE ACCESS
CREATE POLICY "Service role full access to conversations" ON public.conversations
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role full access to messages" ON public.messages
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

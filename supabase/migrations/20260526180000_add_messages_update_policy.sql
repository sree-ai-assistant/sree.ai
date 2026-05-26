-- ============================================================
-- Migration: Add missing UPDATE policy for messages table
-- Fix: messages table had SELECT, INSERT, DELETE policies but no UPDATE policy
-- This caused updateMessage operations to fail silently via RLS
-- ============================================================

-- Add UPDATE policy for messages (was missing from initial anonymous conversations migration)
CREATE POLICY "Users can update messages in their conversations" ON public.messages
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM conversations 
      WHERE conversations.id = messages.conversation_id 
      AND (
        (conversations.user_id = auth.uid()) OR 
        (conversations.anon_id = current_setting('request.headers', true)::json->>'x-anon-id')
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations 
      WHERE conversations.id = messages.conversation_id 
      AND (
        (conversations.user_id = auth.uid()) OR 
        (conversations.anon_id = current_setting('request.headers', true)::json->>'x-anon-id')
      )
    )
  );

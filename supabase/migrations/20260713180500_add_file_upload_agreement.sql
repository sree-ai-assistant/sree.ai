-- Migration: Add file upload agreement columns to profiles table
-- Description: Adds file_upload_agreed and file_upload_agreed_at to track when a user accepts the file upload pop-up agreement.

ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS file_upload_agreed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS file_upload_agreed_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

COMMENT ON COLUMN public.profiles.file_upload_agreed IS 'Whether the user agreed to the file upload popup policy';
COMMENT ON COLUMN public.profiles.file_upload_agreed_at IS 'Timestamp of when the user agreed to the file upload policy';

-- Add avatar column to tblusers for storing user profile image URL/Data URI.
-- Safe to run multiple times.

ALTER TABLE IF EXISTS tblusers
ADD COLUMN IF NOT EXISTS avatar TEXT;

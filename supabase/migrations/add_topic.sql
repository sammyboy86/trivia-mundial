-- Migration: Add topic column to questions table
-- Run this in your Supabase SQL Editor

ALTER TABLE questions ADD COLUMN IF NOT EXISTS topic TEXT;

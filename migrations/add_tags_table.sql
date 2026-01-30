-- Migration: Add tags table and sample_post_tags junction table
-- Run this migration to enable the tagging system for sample posts

-- Create tags table
CREATE TABLE IF NOT EXISTS tags (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create junction table for many-to-many relationship
CREATE TABLE IF NOT EXISTS sample_post_tags (
    sample_post_id VARCHAR(36) REFERENCES sample_posts(id) ON DELETE CASCADE,
    tag_id VARCHAR(36) REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (sample_post_id, tag_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_sample_post_tags_sample_post_id ON sample_post_tags(sample_post_id);
CREATE INDEX IF NOT EXISTS idx_sample_post_tags_tag_id ON sample_post_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);

-- Migrate existing JSON tags to the new tables
-- This is an idempotent migration that:
-- 1. Parses existing JSON tags from sample_posts.tags column
-- 2. Creates unique tags in the tags table
-- 3. Creates associations in sample_post_tags junction table

-- Note: Run this migration with a Python script for proper JSON parsing
-- The SQL below is a placeholder for documentation purposes

-- After migration, the sample_posts.tags column can be kept for backward compatibility
-- or removed in a future migration once all code is updated

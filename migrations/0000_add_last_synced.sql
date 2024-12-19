-- Migration: Add last_synced column
ALTER TABLE products ADD COLUMN last_synced DATETIME DEFAULT NULL; 
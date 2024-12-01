-- Enable foreign key constraints
PRAGMA foreign_keys = ON;

-- Products table to store main product information
CREATE TABLE IF NOT EXISTS products (
    asin TEXT PRIMARY KEY,
    price DECIMAL(10,2),
    product_url TEXT NOT NULL,
    flavor TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Product images table (one-to-many relationship with products)
CREATE TABLE IF NOT EXISTS product_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asin TEXT NOT NULL,
    image_url TEXT NOT NULL,
    position INTEGER NOT NULL, -- To maintain image order
    FOREIGN KEY (asin) REFERENCES products(asin) ON DELETE CASCADE,
    UNIQUE(asin, image_url)
);

-- Product overview table (one-to-many relationship with products)
CREATE TABLE IF NOT EXISTS product_overview (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asin TEXT NOT NULL,
    attribute TEXT NOT NULL,
    value TEXT,
    FOREIGN KEY (asin) REFERENCES products(asin) ON DELETE CASCADE,
    UNIQUE(asin, attribute)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_products_price ON products(price);
CREATE INDEX IF NOT EXISTS idx_products_flavor ON products(flavor);
CREATE INDEX IF NOT EXISTS idx_product_images_asin ON product_images(asin);
CREATE INDEX IF NOT EXISTS idx_product_overview_asin ON product_overview(asin);

-- Trigger to update the updated_at timestamp
CREATE TRIGGER IF NOT EXISTS update_products_timestamp 
AFTER UPDATE ON products
BEGIN
    UPDATE products 
    SET updated_at = CURRENT_TIMESTAMP 
    WHERE asin = NEW.asin;
END;

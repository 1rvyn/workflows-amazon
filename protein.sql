CREATE TABLE products (
    asin VARCHAR(20) PRIMARY KEY,
    price VARCHAR(20),
    product_url VARCHAR(255),
    flavour VARCHAR(255),
    servings_per_container VARCHAR(50),
    item_weight VARCHAR(50),
    material_type_free VARCHAR(100),
    brand VARCHAR(100)
);

CREATE TABLE images (
    image_id INTEGER AUTO_INCREMENT PRIMARY KEY,
    product_asin VARCHAR(20),
    image_url VARCHAR(255),
    FOREIGN KEY (product_asin) REFERENCES products(asin)
);
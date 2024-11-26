CREATE TABLE IF NOT EXISTS Protein (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    price DECIMAL(10,2),
    product_url TEXT,
    brand TEXT,
    flavour TEXT
);

-- Insert some test data
INSERT INTO Protein (price,product_url,brand,flavour) VALUES
	 (81.25,'https://amzn.to/3vJMdX8','Optimum Nutrition','Vanilla Ice Cream'),
	 (39.99,'https://amzn.to/4aCUYRB','Optimum Nutrition','Vanilla Ice Cream'),
	 (41.94,'https://amzn.to/4ay4PYV','Optimum Nutrition','Extreme Milk Chocolate'),
	 (60.03,'https://amzn.to/43MIR2j','BSN','Vanilla Ice Cream'),
	 (47.94,'https://amzn.to/3xhnfz7','Optimum Nutrition','Vanilla'),
	 (64.25,'https://amzn.to/49dzf1z','BSN','Strawberry Milkshake'),
	 (86.9,'https://amzn.to/4cAxvm5','Optimum Nutrition','Velocity Vanilla'),
	 (84.99,'https://www.amazon.com/dp/B000GIPJY8/ref=nosim?tag=ineedprotein-20','Optimum Nutrition','Chocolate Mint'),
	 (80.6,'https://www.amazon.com/dp/B002DYJ00C/ref=nosim?tag=ineedprotein-20','Optimum Nutrition','Mocha Cappuccino'),
	 (84.99,'https://www.amazon.com/dp/B000QSTBQU/ref=nosim?tag=ineedprotein-20','Optimum Nutrition','Rocky Road');
INSERT INTO Protein (price,product_url,brand,flavour) VALUES
	 (123.37,'https://www.amazon.com/dp/B000GIQT2O/ref=nosim?tag=ineedprotein-20','Optimum Nutrition','Double Rich Chocolate'),
	 (41.94,'https://www.amazon.com/dp/B002DYIZHQ/ref=nosim?tag=ineedprotein-20','Optimum Nutrition','French Vanilla Crème'),
	 (41.94,'https://www.amazon.com/dp/B002DYJ0FM/ref=nosim?tag=ineedprotein-20','Optimum Nutrition','Mocha Cappuccino'),
	 (84.99,'https://www.amazon.com/dp/B0015R3AOA/ref=nosim?tag=ineedprotein-20','Optimum Nutrition','Banana Cream'),
	 (83.94,'https://www.amazon.com/dp/B0030FU6VA/ref=nosim?tag=ineedprotein-20','Optimum Nutrition','White Chocolate'),
	 (36.6,'https://www.amazon.com/dp/B002DYJ02A/ref=nosim?tag=ineedprotein-20','Optimum Nutrition','Chocolate Malt'),
	 (157.99,'https://www.amazon.com/dp/B00ZFONQZW/ref=nosim?tag=ineedprotein-20','Optimum Nutrition','Extreme Milk Chocolate'),
	 (84.79,'https://www.amazon.com/dp/B002DYJ02U/ref=nosim?tag=ineedprotein-20','Optimum Nutrition','Chocolate Malt'),
	 (41.94,'https://www.amazon.com/dp/B002DYIZSA/ref=nosim?tag=ineedprotein-20','Optimum Nutrition','Strawberry Banana'),
	 (84.94,'https://www.amazon.com/dp/B000QSRO1Y/ref=nosim?tag=ineedprotein-20','Optimum Nutrition','Delicious Strawberry');
INSERT INTO Protein (price,product_url,brand,flavour) VALUES
	 (84.99,'https://www.amazon.com/dp/B002DYIZT4/ref=nosim?tag=ineedprotein-20','Optimum Nutrition','Strawberry Banana'),
	 (41.94,'https://www.amazon.com/dp/B07PD797QL/ref=nosim?tag=ineedprotein-20','Optimum Nutrition','Strawberries & Cream'),
	 (41.94,'https://www.amazon.com/dp/B002DYIZGM/ref=nosim?tag=ineedprotein-20','Optimum Nutrition','Rocky Road'),
	 (138.08,'https://www.amazon.com/dp/B000GIQT3I/ref=nosim?tag=ineedprotein-20','Optimum Nutrition','Vanilla Ice Cream'),
	 (84.99,'https://www.amazon.com/dp/B000GIPJZ2/ref=nosim?tag=ineedprotein-20','Optimum Nutrition','Cookies & Cream'),
	 (41.94,'https://www.amazon.com/dp/B0015R3AH2/ref=nosim?tag=ineedprotein-20','Optimum Nutrition','Banana Cream'),
	 (62.95,'https://www.amazon.com/dp/B000QSTBNS/ref=nosim?tag=ineedprotein-20','Optimum Nutrition','Extreme Milk Chocolate'),
	 (41.94,'https://www.amazon.com/dp/B000GIQSVG/ref=nosim?tag=ineedprotein-20','Optimum Nutrition','Cookies & Cream'),
	 (79.85,'https://www.amazon.com/dp/B002SG7NG8/ref=nosim?tag=ineedprotein-20','Optimum Nutrition','Coffee'),
	 (76.49,'https://www.amazon.com/dp/B07DJL1PJT/ref=nosim?tag=ineedprotein-20','Optimum Nutrition','Chocolate Peanut Butter');
INSERT INTO Protein (price,product_url,brand,flavour) VALUES
	 (37.49,'https://www.amazon.com/dp/B006E54GJG/ref=nosim?tag=ineedprotein-20','Optimum Nutrition','Chocolate Peanut Butter'),
	 (40.64,'https://www.amazon.com/dp/B000GIURIQ/ref=nosim?tag=ineedprotein-20','Optimum Nutrition','Delicious Strawberry'),
	 (35.47,'https://www.amazon.com/dp/B002DYIZH6/ref=nosim?tag=ineedprotein-20','Optimum Nutrition','Double Rich Chocolate'),
	 (137.99,'https://www.amazon.com/dp/B000GIUROA/ref=nosim?tag=ineedprotein-20','Optimum Nutrition','Delicious Strawberry'),
	 (80.42,'https://amazon.com/dp/B000QSO3FO/ref=nosim?tag=ineedprotein-20','Optimum Nutrition','French Vanilla Crème'),
	 (41.94,'https://amazon.com/dp/B000GIQSV6/ref=nosim?tag=ineedprotein-20','Optimum Nutrition','Chocolate Mint'),
	 (83.53,'https://www.amazon.com/dp/B000QSNYGI/ref=nosim?tag=ineedprotein-20','Optimum Nutrition','Double Rich Chocolate'),
	 (38.21,'https://www.amazon.com/dp/B0CTD7G7JK/ref=nosim?tag=ineedprotein-20','Optimum Nutrition','Fruity Cereal'),
	 (41.94,'https://www.amazon.com/dp/B07FL5NVJZ/ref=nosim?tag=ineedprotein-20','Optimum Nutrition','Chocolate Hazelnut'),
	 (84.69,'https://www.amazon.com/dp/B07PBXBGTP/ref=nosim?tag=ineedprotein-20','Optimum Nutrition','Strawberries & Cream');
INSERT INTO Protein (price,product_url,brand,flavour) VALUES
	 (43.34,'https://www.amazon.com/dp/B0CTD7ZJBX/ref=nosim?tag=ineedprotein-20','Optimum Nutrition','Cinnamon Roll'),
	 (84.29,'https://www.amazon.com/dp/B0026444FA/ref=nosim?tag=ineedprotein-20','Optimum Nutrition','Chocolate Coconut'),
	 (90.89,'https://amazon.com/dp/B00AZMDWQM/ref=nosim?tag=ineedprotein-20','BSN','Vanilla Ice Cream'),
	 (39.12,'https://amazon.com/dp/B07QSC5R37/ref=nosim?tag=ineedprotein-20','BSN','Cookie Doughn''t'),
	 (36.47,'https://amazon.com/dp/B000GP3FME/ref=nosim?tag=ineedprotein-20','BSN','Strawberry Milkshake'),
	 (37.06,'https://amazon.com/dp/B000GP0NSI/ref=nosim?tag=ineedprotein-20','BSN','Chocolate Milkshake'),
	 (86.69,'https://amazon.com/dp/B002DYJ1EC/ref=nosim?tag=ineedprotein-20','BSN','N/A'),
	 (39.89,'https://amazon.com/dp/B07CJCFLNZ/ref=nosim?tag=ineedprotein-20','BSN','Birthday Cake Remix'),
	 (55.87,'https://amazon.com/dp/B008JGI6TE/ref=nosim?tag=ineedprotein-20','BSN','Chocolate Cake Batter'),
	 (41.99,'https://amazon.com/dp/B0CXBDMN7T/ref=nosim?tag=ineedprotein-20','BSN','Blueberry Pancake');
INSERT INTO Protein (price,product_url,brand,flavour) VALUES
	 (37.06,'https://amazon.com/dp/B002DYJ0ZC/ref=nosim?tag=ineedprotein-20','BSN','Cookies and Cream'),
	 (39.12,'https://amazon.com/dp/B07CGS9JDT/ref=nosim?tag=ineedprotein-20','BSN','Mint Mint Chocolate Chocolate Chip'),
	 (39.89,'https://amazon.com/dp/B0CXBB31TH/ref=nosim?tag=ineedprotein-20','BSN','Cinnamon Toaster Pastry'),
	 (37.79,'https://amazon.com/dp/B000GP5HJI/ref=nosim?tag=ineedprotein-20','BSN','Vanilla Ice Cream'),
	 (46.58,'https://amazon.com/dp/B00GJXA2RS/ref=nosim?tag=ineedprotein-20','Optimum Nutrition','Chocolate Peanut Butter'),
	 (42.84,'https://amazon.com/dp/B0015R36XU/ref=nosim?tag=ineedprotein-20','Optimum Nutrition','Strawberry'),
	 (49.03,'https://amazon.com/dp/B0015R18SU/ref=nosim?tag=ineedprotein-20','Optimum Nutrition','Banana'),
	 (42.46,'https://amazon.com/dp/B01DY8NTP2/ref=nosim?tag=ineedprotein-20','BSN','Cookies & Cream'),
	 (38.21,'https://amazon.com/dp/B01DY8NO2A/ref=nosim?tag=ineedprotein-20','BSN','Strawberry Milkshake'),
	 (58.45,'https://amazon.com/dp/B01DY8NW8Q/ref=nosim?tag=ineedprotein-20','BSN','Cookies & Cream');
INSERT INTO Protein (price,product_url,brand,flavour) VALUES
	 (41.99,'https://amazon.com/dp/B01DY8NF6A/ref=nosim?tag=ineedprotein-20','BSN','Vanilla Milkshake'),
	 (58.45,'https://amazon.com/dp/B01DY8NO7K/ref=nosim?tag=ineedprotein-20','BSN','Vanilla Milkshake'),
	 (50.6,'https://amazon.com/dp/B01DY8NO9I/ref=nosim?tag=ineedprotein-20','BSN','Chocolate'),
	 (74.3,'https://amazon.com/dp/B002QZN8JW/ref=nosim?tag=ineedprotein-20','Optimum Nutrition','N/A'),
	 (124.66,'https://amazon.com/dp/B0CSCW2W84/ref=nosim?tag=ineedprotein-20','Optimum Nutrition','Vanilla'),
	 (46.75,'https://amazon.com/dp/B004BR68W2/ref=nosim?tag=ineedprotein-20','Optimum Nutrition','Velocity Vanilla');

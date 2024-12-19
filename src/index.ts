import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';
import * as cheerio from 'cheerio'; // Ensure cheerio is installed

type Env = {
	MY_WORKFLOW: Workflow;
	DB: D1Database;
};

type Params = {
	// Parameters if needed
};

export class MyWorkflow extends WorkflowEntrypoint<Env, Params> {
	async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
		// Step 1: Perform search and collect product URLs
		const searchUrls = [
			'https://www.amazon.com/s?k=protein+powder',
			// 'https://www.amazon.com/s?k=protein+powder&page=2',
			// 'https://www.amazon.com/s?k=protein+powder&page=3',
		];

		// Fetch search result pages and extract product URLs (Step 1)
		const productUrls: string[] = [];
		for (const searchUrl of searchUrls) {
			const urls = await step.do(
				`fetch search results page: ${searchUrl}`,
				{
					retries: { limit: 5, delay: '1 seconds', backoff: 'linear' },
					timeout: '30 seconds',
				},
				async () => {
					// Random delay to reduce suspicion
					const randomDelay = Math.random() * 3000;
					await new Promise((resolve) => setTimeout(resolve, randomDelay));
					const resp = await fetch(searchUrl, {
						headers: {
							'User-Agent':
								'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
							Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
							'Accept-Language': 'en-US,en;q=0.9',
							Connection: 'keep-alive',
							'Upgrade-Insecure-Requests': '1',
							'Cache-Control': 'max-age=0',
							'sec-ch-ua': '"Chromium";v="123", "Not:A-Brand";v="99"',
							'sec-ch-ua-mobile': '?0',
							'sec-ch-ua-platform': '"Windows"',
							'Sec-Fetch-Dest': 'document',
							'Sec-Fetch-Mode': 'navigate',
							'Sec-Fetch-Site': 'none',
							'Sec-Fetch-User': '?1',
						},
					});

					if (!resp.ok) {
						throw new Error(`Failed to fetch search page: ${resp.status} ${resp.statusText}`);
					}

					const html = await resp.text();
					const $ = cheerio.load(html);
					const urls: string[] = [];
					$('div[data-asin]').each((_, element) => {
						const asin = $(element).data('asin');
						if (asin) {
							// Basic product URL (will add affiliate tag later)
							urls.push(`https://www.amazon.com/dp/${asin}`);
						}
					});
					return urls;
				}
			);
			productUrls.push(...urls);
		}

		// Step 2: Extract ASINs (both parent and child) and store them in D1
		await step.do(
			'extract and store ASINs',
			{
				retries: { limit: 3, delay: '10 seconds', backoff: 'linear' },
				timeout: '240 seconds',
			},
			async () => {
				// 1. Log the number of product URLs to process
				console.log(`Number of product URLs to process: ${productUrls.length}`);

				// 2. Define the batch size
				const BATCH_SIZE = 8; // You can adjust this based on performance
				let asinsBatch: string[] = [];
				const uniqueAsinsSet: Set<string> = new Set(); // To ensure uniqueness across batches

				for (const productUrl of productUrls.slice(0, 3)) {
					try {
						const resp = await fetch(productUrl, {
							headers: {
								'User-Agent':
									'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36',
								Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
								'Accept-Language': 'en-US,en;q=0.9',
								Connection: 'keep-alive',
								'Upgrade-Insecure-Requests': '1',
								'Cache-Control': 'max-age=0',
								'sec-ch-ua': '"Chromium";v="123", "Not:A-Brand";v="99"',
								'sec-ch-ua-mobile': '?0',
								'sec-ch-ua-platform': '"Windows"',
								'Sec-Fetch-Dest': 'document',
								'Sec-Fetch-Mode': 'navigate',
								'Sec-Fetch-Site': 'none',
								'Sec-Fetch-User': '?1',
							},
						});

						if (!resp.ok) {
							console.error(`Failed to fetch product URL: ${productUrl} - Status: ${resp.status} ${resp.statusText}`);
							continue;
						}

						const html = await resp.text();
						const $ = cheerio.load(html);

						let parentAsin = '';
						let childAsins: string[] = [];

						// Extract ASINs from scripts
						$('script[type="text/javascript"]').each((_, scriptEl) => {
							const scriptText = $(scriptEl).text();

							if (scriptText.includes('dimensionToAsinMap') && scriptText.includes('parentAsin')) {
								const parentMatch = /"parentAsin"\s*:\s*"([^"]*)"/.exec(scriptText);
								if (parentMatch && parentMatch[1]) {
									parentAsin = parentMatch[1];
								}

								const dimensionMatch = /"dimensionToAsinMap"\s*:\s*({[^}]*})/.exec(scriptText);
								if (dimensionMatch && dimensionMatch[1]) {
									try {
										const dimensionJSON = dimensionMatch[1].replace(/'/g, '"');
										const dimensionObj = JSON.parse(dimensionJSON);
										childAsins = Object.values(dimensionObj);
									} catch (e) {
										console.error('JSON parse error:', e);
									}
								}
							}
						});

						// Collect ASINs, ensuring uniqueness
						if (parentAsin) {
							const cleanedParent = parentAsin.split('-')[0];
							if (cleanedParent) uniqueAsinsSet.add(cleanedParent);
						}

						childAsins.forEach((asin) => {
							const cleanedAsin = asin.split('-')[0];
							if (cleanedAsin) uniqueAsinsSet.add(cleanedAsin);
						});

						// Convert Set to Array for batching
						asinsBatch = Array.from(uniqueAsinsSet);

						// If batch size reached, perform insert
						if (asinsBatch.length >= BATCH_SIZE) {
							const batchToInsert = asinsBatch.slice(0, BATCH_SIZE);
							const placeholders = batchToInsert.map(() => '(?, NULL)').join(', ');
							const insertQuery = `INSERT OR IGNORE INTO products (asin, last_synced) VALUES ${placeholders}`;
							await this.env.DB.prepare(insertQuery)
								.bind(...batchToInsert)
								.run();

							// Remove inserted ASINs from the set
							batchToInsert.forEach((asin) => uniqueAsinsSet.delete(asin));
							// Reset the batch
							asinsBatch = Array.from(uniqueAsinsSet);
						}
					} catch (error) {
						console.error(`Error processing ${productUrl}:`, error);
					}
				}

				// 4. Insert any remaining ASINs in the batch
				if (asinsBatch.length > 0) {
					const batchToInsert = asinsBatch;
					const placeholders = batchToInsert.map(() => '(?, NULL)').join(', ');
					const insertQuery = `INSERT OR IGNORE INTO products (asin, last_synced) VALUES ${placeholders}`;
					await this.env.DB.prepare(insertQuery)
						.bind(...batchToInsert)
						.run();
				}
			}
		);

		// Step 3: Process products that haven't been synced in the last 24 hours
		await step.do(
			'sync outdated products',
			{
				retries: { limit: 5, delay: '10 seconds', backoff: 'exponential' },
				timeout: '1440 seconds',
			},
			async () => {
				const currentTime = new Date().toISOString();
				const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

				// Get 50 products that need updating
				const { results } = await this.env.DB.prepare(`
					SELECT asin 
					FROM products 
					WHERE last_synced IS NULL 
					   OR last_synced < ?
					ORDER BY last_synced ASC NULLS FIRST
					LIMIT 50
				`).bind(oneDayAgo).all();

				if (!results || results.length === 0) {
					console.log('No products need updating at this time');
					return;
				}

				const asinsToUpdate = results.map(row => row.asin as string);
				console.log(`Processing ${asinsToUpdate.length} products that need updating`);

				// Process each product with retries and backoff
				for (const asin of asinsToUpdate) {
					let retryCount = 0;
					const maxRetries = 3;
					let delay = 1000; // Start with 1 second delay

					while (retryCount <= maxRetries) {
						try {
							const productUrl = `https://www.amazon.com/dp/${asin}`;
							console.log(`Processing ASIN ${asin} (attempt ${retryCount + 1})`);

							const resp = await fetch(productUrl, {
								headers: {
									'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36',
									Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
									'Accept-Language': 'en-US,en;q=0.9',
									Connection: 'keep-alive',
									'Upgrade-Insecure-Requests': '1',
									'Cache-Control': 'max-age=0',
									'sec-ch-ua': '"Chromium";v="123", "Not:A-Brand";v="99"',
									'sec-ch-ua-mobile': '?0',
									'sec-ch-ua-platform': '"Windows"',
									'Sec-Fetch-Dest': 'document',
									'Sec-Fetch-Mode': 'navigate',
									'Sec-Fetch-Site': 'none',
									'Sec-Fetch-User': '?1',
								},
							});

							if (!resp.ok) {
								throw new Error(`HTTP error! status: ${resp.status}`);
							}

							const html = await resp.text();
							const productData = this.extractProductData(html, productUrl);

							// Update product data and last_synced timestamp
							await this.env.DB.prepare(`
								UPDATE products 
								SET price = ?, 
									product_url = ?, 
									flavour = ?, 
									product_details = ?,
									last_synced = ?
								WHERE asin = ?
							`).bind(
								productData.price,
								`${productData.product_url}?tag=ineedprotei0e-20`,
								productData.flavour,
								JSON.stringify({
									images: productData.images,
									productOverview: productData.productOverview,
								}),
								currentTime,
								asin
							).run();

							console.log(`Successfully updated ASIN ${asin}`);
							
							// Add a small delay between successful products to avoid rate limiting
							await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));
							break; // Success, exit retry loop

						} catch (error) {
							console.error(`Error processing ASIN ${asin} (attempt ${retryCount + 1}):`, error);
							
							if (retryCount === maxRetries) {
								console.error(`Max retries reached for ASIN ${asin}, moving to next product`);
								break;
							}

							// Exponential backoff with jitter
							const jitter = Math.random() * 1000;
							await new Promise(resolve => setTimeout(resolve, delay + jitter));
							delay *= 2; // Double the delay for next attempt
							retryCount++;
						}
					}
				}
			}
		);

		// Step 4: Retrieve all distinct ASINs from D1
		const finalASINs = await step.do('retrieve distinct ASINs from D1', async () => {
			try {
				const { results } = await this.env.DB.prepare('SELECT DISTINCT asin FROM products').all();
				if (!results) {
					console.error('No results returned from DB query');
					return [];
				}
				return results.map((row) => row.asin as string);
			} catch (err) {
				console.error('Error retrieving ASINs:', err);
				return [];
			}
		});

		// Step 5: Fetch and update product data for all ASINs
		await step.do(
			'fetch and update product data for all ASINs',
			{
				retries: { limit: 5, delay: '10 seconds', backoff: 'linear' },
				timeout: '1440 seconds',
			},
			async () => {
				try {
					const BATCH_SIZE = 4; // Consider reducing if issues persist
					console.log(`Starting to process ASINs in batches of ${BATCH_SIZE}`);

					for (let i = 0; i < finalASINs.length; i += BATCH_SIZE) {
						const batch = finalASINs.slice(i, i + BATCH_SIZE);
						const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
						console.log(`Processing batch ${batchNumber}:`, batch);

						// Fetch product data concurrently within the batch
						const fetchPromises = batch.map(async (asin) => {
							const productUrl = `https://www.amazon.com/dp/${asin}`;
							try {
								const resp = await fetch(productUrl, {
									headers: {
										'User-Agent':
											'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36',
										Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
										'Accept-Language': 'en-US,en;q=0.9',
										Connection: 'keep-alive',
										'Upgrade-Insecure-Requests': '1',
										'Cache-Control': 'max-age=0',
										'sec-ch-ua': '"Chromium";v="123", "Not:A-Brand";v="99"',
										'sec-ch-ua-mobile': '?0',
										'sec-ch-ua-platform': '"Windows"',
										'Sec-Fetch-Dest': 'document',
										'Sec-Fetch-Mode': 'navigate',
										'Sec-Fetch-Site': 'none',
										'Sec-Fetch-User': '?1',
									},
								});

								if (!resp.ok) {
									console.error(`Failed to fetch product page for ASIN ${asin}: ${resp.status} ${resp.statusText}`);
									return null;
								}

								const html = await resp.text();
								let productData;
								try {
									productData = this.extractProductData(html, productUrl);
								} catch (extractError) {
									console.error(`Error extracting product data for ASIN ${asin}:`, extractError);
									return null;
								}
								return productData;
							} catch (fetchError) {
								console.error(`Error fetching product page for ASIN ${asin}:`, fetchError);
								return null;
							}
						});

						// Wait for all fetches in the batch to complete
						const productsData = await Promise.all(fetchPromises);

						// Prepare batch updates
						const updatePromises = productsData.map(async (productData) => {
							if (productData) {
								try {
									await this.env.DB.prepare(
										`UPDATE products 
										 SET price = ?, 
											 product_url = ?, 
											 flavour = ?, 
											 product_details = ? 
										 WHERE asin = ?`
									)
										.bind(
											productData.price,
											`${productData.product_url}?tag=ineedprotei0e-20`,
											productData.flavour,
											JSON.stringify({
												images: productData.images,
												productOverview: productData.productOverview,
											}),
											productData.asin
										)
										.run();
								} catch (updateError) {
									console.error(`Error updating product data for ASIN ${productData.asin}:`, updateError);
									// Optionally, implement retry logic here for failed updates
								}
							}
						});

						// Execute all updates in the batch concurrently
						await Promise.all(updatePromises);
						console.log(`Batch ${batchNumber} processed successfully.`);
					}

					console.log('All ASINs have been processed successfully.');
				} catch (stepError) {
					console.error('Error in Step 5 (fetch and update product data):', stepError);
					// Optionally, rethrow the error to trigger the retry mechanism
					throw stepError;
				}
			}
		);
	}

	extractProductData(html: string, product_url: string) {
		const $ = cheerio.load(html);

		let price = '';
		let flavour = '';
		let images: string[] = [];
		let productOverview: Record<string, string> = {};

		// Extract price
		const priceElement = $('span.a-price span.a-offscreen').first();
		price = priceElement.length ? priceElement.text().trim() : '';

		// Extract flavor
		const variationFlavor = $('#variation_flavor_name .selection');
		if (variationFlavor.length) {
			flavour = variationFlavor.text().trim();
		} else {
			const twisterFlavor = $('.twisterTextDiv.text p');
			if (twisterFlavor.length) {
				flavour = twisterFlavor.text().trim();
			}
		}

		// Extract images from carousel
		const imageElements = $('div#imageBlock img');
		images = imageElements.map((_, el) => $(el).attr('src') || '').get();

		// Extract productOverview
		const productOverviewDiv = $('#productOverview_feature_div');
		if (productOverviewDiv.length) {
			const table = productOverviewDiv.find('table.a-normal.a-spacing-micro');
			const rows = table.find('tr');
			rows.each((_, element) => {
				const $row = $(element);
				const label = $row.find('td.a-span3 span.a-text-bold').text().trim();
				const value = $row.find('td.a-span9 span.po-break-word').text().trim();
				productOverview[label] = value;
			});
		}

		return {
			asin: this.extractASINFromURL(product_url),
			price,
			product_url,
			flavour,
			images,
			productOverview,
		};
	}

	extractASINFromURL(url: string): string {
		const match = url.match(/\/dp\/([A-Z0-9]{10})/);
		return match ? match[1] : '';
	}
}

export default {
	async fetch(req: Request, env: Env): Promise<Response> {
		const url = new URL(req.url);

		if (url.pathname.startsWith('/favicon')) {
			return Response.json({}, { status: 404 });
		}

		// Check status of existing instance
		const id = url.searchParams.get('instanceId');
		if (id) {
			const instance = await env.MY_WORKFLOW.get(id);
			return Response.json({
				status: await instance.status(),
			});
		}

		// Spawn new instance
		const instance = await env.MY_WORKFLOW.create();
		return Response.json({
			id: instance.id,
			details: await instance.status(),
		});
	},
};

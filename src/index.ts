import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';
import * as cheerio from 'cheerio';

type Env = {
	MY_WORKFLOW: Workflow;
	DB: D1Database;
};

type Params = {
	// Parameters if needed
};

interface ProductData {
	asin: string;
	price: string;
	product_url: string;
	flavour: string;
	images: string[];
	productOverview: Record<string, string>;
}

interface DBProduct {
	asin: string;
	price?: string;
	product_url?: string;
	flavour?: string;
	product_details?: string;
	last_synced?: string;
}

export class MyWorkflow extends WorkflowEntrypoint<Env, Params> {
	async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
		// Step 1: Get the 8 least recently updated products
		// Temporarily hardcoded for testing
		const productsToUpdate = await step.do(
			'fetch products to update',
			async () => {
				// const { results } = await this.env.DB.prepare(`
				// 	SELECT * FROM products 
				// 	ORDER BY last_synced ASC NULLS FIRST
				// 	LIMIT 8
				// `).all<DBProduct>();

				const { results } = await this.env.DB.prepare(`
					SELECT * FROM products WHERE asin = 'B0106Z1LE2';	
					 `).all<DBProduct>();

				return results || [];
			}
		);

		// Step 2: Update product data
		const updatedAsins = await step.do(
			'update product data',
			{
				retries: { limit: 3, delay: '10 seconds', backoff: 'exponential' },
				timeout: '240 seconds',
			},
			async () => {
				const updatedAsins: string[] = [];
				const currentTime = new Date().toISOString();

				for (const product of productsToUpdate) {
					try {
						const productUrl = `https://www.amazon.com/dp/${product.asin}`;
						console.log(`Processing ASIN ${product.asin}`);
						const resp = await fetch(productUrl, {
							headers: {
								'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
								'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
								'Accept-Language': 'en-US,en;q=0.9',
								'Connection': 'keep-alive',
								'Accept-Encoding': 'gzip, deflate, br',
								'Cache-Control': 'no-cache',
								'sec-ch-ua': '"Not A(Brand";v="99", "Google Chrome";v="120", "Chromium";v="120"',
								'sec-ch-ua-mobile': '?0',
								'sec-ch-ua-platform': '"Windows"',
								'Sec-Fetch-Dest': 'document',
								'Sec-Fetch-Mode': 'navigate',
								'Sec-Fetch-Site': 'none',
								'Sec-Fetch-User': '?1',
							},
							cache: 'no-store',
							cf: {
								cacheEverything: false,
								cacheTtlByStatus: {
									'200-299': 0,
									'300-399': 0,
									'400-499': 0,
									'500-599': 0
								}						
							}
						});

						if (!resp.ok) {
							throw new Error(`HTTP error! status: ${resp.status}`);
						}

						const html = await resp.text();
						//console.log('HTML:', html);
						const productData = this.extractProductData(html, productUrl);
						console.log('Product Data:', productData);
						// here we need to check if we keep the existing product or use productData						
						// first check to see if the productOverview is empty
						if (Object.keys(productData.productOverview).length === 0 && product.price) {
							// use the existing product
							continue;
						} else {
							// set products.unavailable to true
							await this.env.DB.prepare(`
								UPDATE products 
								SET unavailable = true
								WHERE asin = ?
							`).bind(product.asin).run();
						}

						// we covered most of the severe broken cases but what we can do now is:
						// if price is different, update price if flavor diff leave the original flavor
						// if images are different, update images

						if (productData.flavour !== product.flavour && product.flavour) {
							// update flavor in productData 
							productData.flavour = product.flavour;
						}

						// Update product data and last_synced timestamp
						await this.env.DB.prepare(`
							UPDATE products 
							SET price = ?, 
								product_url = ?, 
								flavour = ?, 
								product_details = ?,
								unavailable = ?,
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
							false,
							currentTime,
							product.asin
						).run();

						updatedAsins.push(product.asin);
						console.log(`Successfully updated ASIN ${product.asin}`);

						// Add a small delay between products to avoid rate limiting
						await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));

					} catch (error) {
						console.error(`Error processing ASIN ${product.asin}:`, error);
					}
				}

				return updatedAsins;
			}
		);

		// Return the list of updated ASINs
		return {
			updated_assin_count: updatedAsins.length,
			updated_asins: updatedAsins
		};
	}

	extractProductData(html: string, product_url: string) {
		const $ = cheerio.load(html);
		let price = '';
		let flavour = '';
		let images: string[] = [];
		let productOverview: Record<string, string> = {};
	  
		// Strategy 1: Try to extract price from JSON‑LD
		const jsonLdScript = $('script[type="application/ld+json"]').html();
		if (jsonLdScript) {
		  try {
			const jsonData = JSON.parse(jsonLdScript);
			if (jsonData.offers && jsonData.offers.price) {
			  // Price might be a number or string
			  price = typeof jsonData.offers.price === 'number'
				? `$${jsonData.offers.price}`
				: jsonData.offers.price;
			}
		  } catch (err) {
			console.error("Error parsing JSON‑LD for price:", err);
		  }
		}
	  
		// Strategy 2: Use common priceblock selectors if JSON‑LD did not yield a price
		if (!price) {
		  price = $('#priceblock_ourprice').text().trim() || $('#priceblock_dealprice').text().trim();
		}
	  
		// Strategy 3: Fallback to parsing the .a-price container
		if (!price) {
		  const priceElement = $('.a-price[data-a-size="medium_plus"][data-a-color="base"]');
		  if (priceElement.length) {
			// Try getting price from a-offscreen first
			const offscreenPrice = priceElement.find('.a-offscreen').first().text().trim();
			if (offscreenPrice) {
			  price = offscreenPrice;
			} else {
			  // Fallback: combine parts manually
			  const symbol = priceElement.find('.a-price-symbol').first().text().trim();
			  const whole = priceElement.find('.a-price-whole').first().text().trim();
			  const fraction = priceElement.find('.a-price-fraction').first().text().trim();
			  if (symbol && whole) {
				price = `${symbol}${whole}${fraction ? '.' + fraction : ''}`;
			  }
			}
		  }
		}
	  
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
	  
		// Extract product overview
		const productOverviewDiv = $('#productOverview_feature_div');
		if (productOverviewDiv.length) {
		  const table = productOverviewDiv.find('table.a-normal.a-spacing-micro');
		  const rows = table.find('tr');
		  rows.each((_, element) => {
			const $row = $(element);
			const label = $row.find('td.a-span3 span.a-text-bold').text().trim();
			const value = $row.find('td.a-span9 span.po-break-word').text().trim();
			if (label) {
			  productOverview[label] = value;
			}
		  });
		}
		// If flavor is still empty, check if productOverview has a "Flavor" key
		if (!flavour && productOverview['Flavor']) {
		  flavour = productOverview['Flavor'];
		}
	  
		return {
		  asin: product_url, // You might want to adjust this if you need to extract a true ASIN
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

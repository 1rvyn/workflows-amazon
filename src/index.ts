import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';
import * as cheerio from 'cheerio';
import puppeteer from '@cloudflare/puppeteer';

type Env = {
  MY_WORKFLOW: Workflow;
  DB: D1Database;
  MYBROWSER: Fetcher;
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
    // For testing we're using a hardcoded query for ASIN B0106Z1LE2
    const productsToUpdate = await step.do(
      'fetch products to update',
      async () => {
        const { results } = await this.env.DB.prepare(`
          SELECT * FROM products WHERE asin = 'B0106Z1LE2';
        `).all<DBProduct>();
		console.log(results);
        return results || [];
      }
    );

    // Step 2: Initialize a Cloudflare headless browser session
    const browserSession = await step.do(
      'initialize browser session',
      async () => {
		console.log("MYBROWSER binding:", this.env.MYBROWSER);
        const browser = await puppeteer.launch(this.env.MYBROWSER);
        const page = await browser.newPage();
		console.log(page);
        await page.setUserAgent(
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        );
        return page;
      }
    );

    // Step 3: Process each product using the headless browser session
    const updatedAsins = await step.do(
      'update product data via headless browser',
      {
        retries: { limit: 3, delay: '10 seconds', backoff: 'exponential' },
        timeout: '240 seconds'
      },
      async () => {
        const updatedAsins: string[] = [];
        const currentTime = new Date().toISOString();

        for (const product of productsToUpdate) {
          try {
            const productUrl = `https://www.amazon.com/dp/${product.asin}`;
            console.log(`Processing ASIN ${product.asin}`);

            // Navigate to the page and wait for content to load
            await browserSession.goto(productUrl, {
              waitUntil: 'networkidle0',
              timeout: 30000
            });

            // Get the rendered HTML
            const html = await browserSession.content();

            // Log a snippet of the HTML for testing/inspection
            console.log(`HTML snippet for ${product.asin}:`, html.substring(0, 500));

            // Extract product data from the rendered HTML
            const productData = this.extractProductData(html, productUrl);
            console.log('Extracted Product Data:', productData);

            // If productOverview is empty and there's an existing price, skip updating
            if (Object.keys(productData.productOverview).length === 0 && product.price) {
              continue;
            } else {
              // Mark product as unavailable if data seems missing
              await this.env.DB.prepare(`
                UPDATE products 
                SET unavailable = true
                WHERE asin = ?
              `)
                .bind(product.asin)
                .run();
            }

            // If flavour differs and an existing flavour exists, retain the original
            if (productData.flavour !== product.flavour && product.flavour) {
              productData.flavour = product.flavour;
            }

            // Update the product data and timestamp in the database
            await this.env.DB.prepare(`
              UPDATE products 
              SET price = ?, 
                  product_url = ?, 
                  flavour = ?, 
                  product_details = ?,
                  unavailable = ?,
                  last_synced = ?
              WHERE asin = ?
            `)
              .bind(
                productData.price,
                `${productData.product_url}?tag=ineedprotei0e-20`,
                productData.flavour,
                JSON.stringify({
                  images: productData.images,
                  productOverview: productData.productOverview
                }),
                false,
                currentTime,
                product.asin
              )
              .run();

            updatedAsins.push(product.asin);
            console.log(`Successfully updated ASIN ${product.asin}`);

            // Add a small delay between requests to help with rate limiting
            await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));
          } catch (error) {
            console.error(`Error processing ASIN ${product.asin}:`, error);
          }
        }
        return updatedAsins;
      }
    );

    return {
      updated_assin_count: updatedAsins.length,
      updated_asins: updatedAsins
    };
  }

  extractProductData(html: string, product_url: string): ProductData {
    const $ = cheerio.load(html);
    let price = '';
    let flavour = '';
    let images: string[] = [];
    let productOverview: Record<string, string> = {};

    // Strategy 1: Try to extract price from JSON‑LD (if present)
    const jsonLdScript = $('script[type="application/ld+json"]').html();
    if (jsonLdScript) {
      try {
        const jsonData = JSON.parse(jsonLdScript);
        if (jsonData.offers && jsonData.offers.price) {
          price =
            typeof jsonData.offers.price === 'number'
              ? `$${jsonData.offers.price}`
              : jsonData.offers.price;
        }
      } catch (err) {
        console.error("Error parsing JSON‑LD for price:", err);
      }
    }

    // Strategy 2: Use common price block selectors
    if (!price) {
      price = $('#priceblock_ourprice').text().trim() || $('#priceblock_dealprice').text().trim();
    }

    // Strategy 3: Fallback to parsing the .a-price container
    if (!price) {
      const priceElement = $('.a-price[data-a-size="medium_plus"][data-a-color="base"]');
      if (priceElement.length) {
        const offscreenPrice = priceElement.find('.a-offscreen').first().text().trim();
        if (offscreenPrice) {
          price = offscreenPrice;
        } else {
          const symbol = priceElement.find('.a-price-symbol').first().text().trim();
          const whole = priceElement.find('.a-price-whole').first().text().trim();
          const fraction = priceElement.find('.a-price-fraction').first().text().trim();
          if (symbol && whole) {
            price = `${symbol}${whole}${fraction ? '.' + fraction : ''}`;
          }
        }
      }
    }

    // Extract flavor information
    const variationFlavor = $('#variation_flavor_name .selection');
    if (variationFlavor.length) {
      flavour = variationFlavor.text().trim();
    } else {
      const twisterFlavor = $('.twisterTextDiv.text p');
      if (twisterFlavor.length) {
        flavour = twisterFlavor.text().trim();
      }
    }

    // Extract image URLs from the carousel
    const imageElements = $('div#imageBlock img');
    images = imageElements.map((_, el) => $(el).attr('src') || '').get();

    // Extract product overview details
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
    if (!flavour && productOverview['Flavor']) {
      flavour = productOverview['Flavor'];
    }

    return {
      asin: product_url, // Adjust if you need to extract the true ASIN.
      price,
      product_url,
      flavour,
      images,
      productOverview
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
        status: await instance.status()
      });
    }
    // Spawn a new workflow instance
    const instance = await env.MY_WORKFLOW.create();
    return Response.json({
      id: instance.id,
      details: await instance.status()
    });
  }
};
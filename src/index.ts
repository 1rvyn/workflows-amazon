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
            // You can add more pages once stable
            // 'https://www.amazon.com/s?k=protein+powder&page=2',
            // 'https://www.amazon.com/s?k=protein+powder&page=3'
        ];

        // Fetch search result pages and extract product URLs (Step 1)
        const productUrls: string[] = [];
        for (const searchUrl of searchUrls) {
            const urls = await step.do(`fetch search results page: ${searchUrl}`, {
                retries: { limit: 5, delay: '1 seconds', backoff: "linear" },
                timeout: '30 seconds',
            }, async () => {
                // Random delay to reduce suspicion
                const randomDelay = Math.random() * 3000; 
                await new Promise(resolve => setTimeout(resolve, randomDelay));


                const resp = await fetch(searchUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.9',
                        'Connection': 'keep-alive',
                        'Upgrade-Insecure-Requests': '1',
                        'Cache-Control': 'max-age=0',
                        'sec-ch-ua': '"Chromium";v="123", "Not:A-Brand";v="99"',
                        'sec-ch-ua-mobile': '?0',
                        'sec-ch-ua-platform': '"Windows"',
                        'Sec-Fetch-Dest': 'document',
                        'Sec-Fetch-Mode': 'navigate',
                        'Sec-Fetch-Site': 'none',
                        'Sec-Fetch-User': '?1',
                    }
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
            });
            productUrls.push(...urls);
        }

        // Step 2: Extract ASINs (both parent and child) and store them in D1
        await step.do('extract and store ASINs', {
            retries: { limit: 5, delay: '5 seconds', backoff: "linear" },
            timeout: '60 seconds',
        }, async () => {
            for (const productUrl of productUrls.slice(0, 3)) {
                try {
                    const resp = await fetch(productUrl, { headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.9',
                        'Connection': 'keep-alive',
                        'Upgrade-Insecure-Requests': '1',
                        'Cache-Control': 'max-age=0',
                        'sec-ch-ua': '"Chromium";v="123", "Not:A-Brand";v="99"',
                        'sec-ch-ua-mobile': '?0',
                        'sec-ch-ua-platform': '"Windows"',
                        'Sec-Fetch-Dest': 'document',
                        'Sec-Fetch-Mode': 'navigate',
                        'Sec-Fetch-Site': 'none',
                        'Sec-Fetch-User': '?1',
                    } });
                    if (!resp.ok) {
                        console.error(`Failed to fetch product URL: ${productUrl}`);
                        continue;
                    }
            
                    const html = await resp.text();
                    const $ = cheerio.load(html);
            
                    // Extract parent and child ASINs inline
                    let parentAsin = '';
                    let childAsins: string[] = [];
            
                    $('script[type="text/javascript"]').each((_, scriptEl) => {
                        const scriptText = $(scriptEl).text();
            
                        if (scriptText.includes('dimensionToAsinMap') && scriptText.includes('parentAsin')) {
                            // Extract parentAsin
                            const parentMatch = /"parentAsin"\s*:\s*"([^"]*)"/.exec(scriptText);
                            if (parentMatch && parentMatch[1]) {
                                parentAsin = parentMatch[1];
                            }
            
                            // Extract dimensionToAsinMap JSON
                            const dimensionMatch = /"dimensionToAsinMap"\s*:\s*({[^}]*})/.exec(scriptText);
                            if (dimensionMatch && dimensionMatch[1]) {
                                try {
                                    // Ensure valid JSON by replacing single quotes if needed.
                                    const dimensionJSON = dimensionMatch[1].replace(/'/g, '"');
                                    const dimensionObj = JSON.parse(dimensionJSON);
                                    // dimensionObj should map keys to ASIN strings
                                    childAsins = Object.values(dimensionObj);
                                } catch (e) {
                                    console.error('Error parsing dimensionToAsinMap:', e);
                                }
                            }
                        }
                    });
            
                    // Insert parentAsin
                    if (parentAsin) {
                        const cleanedParent = parentAsin.includes('-') ? parentAsin.split('-')[0] : parentAsin;
                        if (cleanedParent) {
                            await this.env.DB.prepare(`INSERT OR IGNORE INTO products (asin) VALUES (?)`)
                                .bind(cleanedParent)
                                .run();
                        }
                    }
            
                    // Insert childAsins
                    for (const asin of childAsins) {
                        const cleanedAsin = asin.includes('-') ? asin.split('-')[0] : asin;
                        if (cleanedAsin) {
                            await this.env.DB.prepare(`INSERT OR IGNORE INTO products (asin) VALUES (?)`)
                                .bind(cleanedAsin)
                                .run();
                        }
                    }
                } catch (error) {
                    console.error(`Error processing ${productUrl}:`, error);
                }
            }
        });

        // Step 3: Retrieve all ASINs from D1
        const finalASINs = await step.do('retrieve ASINs from D1', async () => {
            const { results } = await this.env.DB.prepare('SELECT asin FROM products').all();
            return results.map(row => row.asin as string);
        });

        // Step 4: Fetch product data and update D1
        await step.do('fetch and update product data for all ASINs', {
            retries: { limit: 5, delay: '5 seconds', backoff: "linear" },
            timeout: '120 seconds',
        }, async () => {
            for (const asin of finalASINs) {
                const productUrl = `https://www.amazon.com/dp/${asin}`;
                try {
                    const resp = await fetch(productUrl, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36',
                            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                            'Accept-Language': 'en-US,en;q=0.9',
                            'Accept-Encoding': 'gzip, deflate, br',
                            'Connection': 'keep-alive',
                            'Upgrade-Insecure-Requests': '1',
                            'Cache-Control': 'max-age=0',
                        }
                    });

                    if (!resp.ok) {
                        console.error(`Failed to fetch product page for ASIN ${asin}: ${resp.status} ${resp.statusText}`);
                        continue;
                    }

                    const html = await resp.text();
                    const productData = this.extractProductData(html, productUrl);

                    if (productData) {
                        await this.env.DB.prepare(
                            `UPDATE products SET price = ?, product_url = ?, flavour = ?, product_details = ? WHERE asin = ?`
                        ).bind(
                            productData.price,
                            productData.product_url + '?tag=ineedprotei0e-20',
                            productData.flavour,
                            JSON.stringify({ images: productData.images, productOverview: productData.productOverview }),
                            productData.asin
                        ).run();
                    }
                } catch (error) {
                    console.error(`Error fetching or updating product data for ASIN ${asin}:`, error);
                }
            }
        });
    }

    extractProductASINs(html: string) {
        const $ = cheerio.load(html);

        let parentAsin = '';
        let asins: string[] = [];

        const scriptTags = $('script[type="text/javascript"]');
        scriptTags.each((_, script) => {
            const scriptText = $(script).text();
            if (scriptText.includes('dimensionToAsinMap') && scriptText.includes('parentAsin')) {
                // Extract parentAsin
                const parentAsinMatch = /"parentAsin"\s*:\s*"([^"]*)"/.exec(scriptText);
                if (parentAsinMatch && parentAsinMatch[1]) {
                    parentAsin = parentAsinMatch[1];
                }

                // Extract dimensionToAsinMap
                const dimensionToAsinMapMatch = /"dimensionToAsinMap"\s*:\s*{([^}]*)}/.exec(scriptText);
                if (dimensionToAsinMapMatch && dimensionToAsinMapMatch[1]) {
                    const dimensionToAsinMapString = `{${dimensionToAsinMapMatch[1]}}`; 
                    try {
                        const dimensionToAsinMap = JSON.parse(dimensionToAsinMapString.replace(/'/g, '"'));
                        asins = Object.values(dimensionToAsinMap);
                    } catch (e) {
                        console.error('Error parsing dimensionToAsinMap:', e);
                    }
                }
            }
        });

        return {
            parentAsin,
            childAsins: asins,
        };
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
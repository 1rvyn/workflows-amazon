import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';
import * as cheerio from 'cheerio'; // Ensure cheerio is installed
import pLimit from 'p-limit';

type Env = {
    MY_WORKFLOW: Workflow;
    D1_DEMO: D1Database;
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

        const userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
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

                const randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];

                const resp = await fetch(searchUrl, {
                    headers: {
                        'User-Agent': randomUserAgent,
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

        // Step 2: Extract ASINs (both parent and child) directly in one step
        const finalASINs = await step.do('extract all ASINs from product URLs', {
            retries: { limit: 5, delay: '5 seconds', backoff: "linear" },
            timeout: '60 seconds',
        }, async () => {
            const limit = pLimit(2); // limit concurrency to 2
            const asinsSet = new Set<string>();

            // Process product URLs with concurrency limit
            await Promise.all(productUrls.map(productUrl =>
                limit(async () => {
                    try {
                        const resp = await fetch(productUrl);
                        if (!resp.ok) {
                            console.error(`Failed to fetch product URL: ${productUrl} - ${resp.status} ${resp.statusText}`);
                            return;
                        }

                        const html = await resp.text();
                        const { parentAsin, childAsins } = this.extractProductASINs(html);

                        // Clean and add parent ASIN
                        if (parentAsin) {
                            const cleanedParentAsin = parentAsin.includes('-') ? parentAsin.split('-')[0] : parentAsin;
                            if (cleanedParentAsin) { // Further check to ensure cleaned ASIN is valid
                                asinsSet.add(cleanedParentAsin);
                            } else {
                                console.error(`Invalid parent ASIN after cleaning: ${parentAsin}`);
                            }
                        }

                        // Clean and add child ASINs
                        for (const asin of childAsins) {
                            if (asin) {
                                const cleanedAsin = asin.includes('-') ? asin.split('-')[0] : asin;
                                if (cleanedAsin) { // Further check to ensure cleaned ASIN is valid
                                    asinsSet.add(cleanedAsin);
                                } else {
                                    console.error(`Invalid child ASIN after cleaning: ${asin}`);
                                }
                            }
                        }
                    } catch (error) {
                        console.error(`Error processing ${productUrl}:`, error);
                    }
                })
            ));

            return Array.from(asinsSet);
        });

        // Step 3: Fetch product data with concurrency limit
        const productDataList = await step.do('fetch product data for all ASINs', {
            retries: { limit: 5, delay: '5 seconds', backoff: "linear" },
            timeout: '120 seconds',
        }, async () => {
            const limit = pLimit(2);
            const results = await Promise.all(
                finalASINs.map(asin =>
                    limit(async () => {
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
                                return null;
                            }

                            const html = await resp.text();
                            return this.extractProductData(html, productUrl);
                        } catch (error) {
                            console.error(`Error fetching product data for ASIN ${asin}:`, error);
                            return null;
                        }
                    })
                )
            );

            // Filter out null results
            return results.filter(Boolean);
        });

        // Step 4: Insert product data into D1 database in chunks
        const chunkSize = 10;
        for (let i = 0; i < productDataList.length; i += chunkSize) {
            const chunk = productDataList.slice(i, i + chunkSize);
            await step.do(`insert product data into D1: chunk ${Math.floor(i/chunkSize) + 1}`, async () => {
                for (const product of chunk) {
                    if (product) {
                    await this.env.D1_DEMO.prepare(
                        `INSERT OR REPLACE INTO products (asin, price, product_url, flavour, product_details) 
                         VALUES (?, ?, ?, ?, ?)`
                    ).bind(
                        product.asin,
                        product.price,
                        product.product_url + '?tag=ineedprotei0e-20',
                        product.flavour,
                        JSON.stringify({ images: product.images, productOverview: product.productOverview })
                    ).run();
                }
                }
            });
        }
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
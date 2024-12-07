import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';
import * as cheerio from 'cheerio'; // Ensure you have cheerio installed

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

        const productUrlsList = await Promise.all(
            searchUrls.map(searchUrl =>
                step.do(`fetch search results page: ${searchUrl}`, {
                    retries: { limit: 5, delay: '2 second', backoff: "constant" },
                    timeout: '30 seconds',
                }, async () => {
                    const randomDelay = Math.random() * 3000; // Random delay between 0 and 3 seconds
                    await new Promise(resolve => setTimeout(resolve, randomDelay));

                    const randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];

                    try {
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
                            try {
                                const contentType = resp.headers.get('content-type');
                                if (contentType && contentType.includes('application/json')) {
                                    console.log(await resp.json());
                                } else {
                                    console.log(await resp.text());
                                }
                            } catch (e) {
                                console.error("Error logging response:", e);
                            }
                            throw new Error(`Failed to fetch search page: ${resp.status} ${resp.statusText}`);
                        }

                        const html = await resp.text();
                        const $ = cheerio.load(html);
                        const urls: string[] = [];
                        $('div[data-asin]').each((_, element) => {
                            const asin = $(element).data('asin');
                            if (asin) {
                                urls.push(`https://www.amazon.com/dp/${asin}`);
                            }
                        });
                        return urls;
                    } catch (error) {
                        console.error(`Error fetching ${searchUrl}:`, error);
                        throw error; // Re-throw the error to trigger the retry mechanism
                    }
                })
            )
        );

        // Flatten the list of product URLs
        const productUrls = productUrlsList.flat();
        console.log('productUrls returned: ', productUrls);
        // Step 2: Extract ASINs from product URLs
        const finalASINs = await step.do(
            'extract all child and parent ASINs from search results',
            async () => {
                const asinsList = await Promise.all(
                    productUrls.map(productUrl =>
                        step.do(`extract ASINs from ${productUrl}`, async () => {
                            const html = await fetch(productUrl).then(res => res.text());
                            const asinData = this.extractProductASINs(html, productUrl);
                            const asins = [asinData.parentAsin, ...asinData.childAsins];
                            return asins.filter(Boolean);
                        })
                    )
                );

                // Flatten and deduplicate ASINs
                const allAsins = Array.from(new Set(asinsList.flat()));
                console.log('top 30 asins: ', allAsins.slice(0, 30));
                console.log('number of asins: ', allAsins.length);
                return allAsins.slice(0, 3); // Adjust as needed
            }
        );

        // Step 3: Fetch each product page and extract data
        const productDataList = await Promise.all(
            finalASINs.map(asin =>
                step.do(`fetch and parse product page: ${asin}`, {
                    retries: { limit: 1, delay: '1 second', backoff: "constant" },
                    timeout: '30 seconds',
                }, async () => {
                    const resp = await fetch(`https://www.amazon.com/dp/${asin}`, {
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
                        throw new Error(`Failed to fetch product page: ${resp.status} ${resp.statusText}`);
                    }

                    const html = await resp.text();
                    return this.extractProductData(html, `https://www.amazon.com/dp/${asin}`);
                })
            )
        );

        // Step 4: Insert product data into D1 database in chunks
        const chunkSize = 10;
        const insertChunks = [];

        for (let i = 0; i < productDataList.length; i += chunkSize) {
            const chunk = productDataList.slice(i, i + chunkSize);
            insertChunks.push(chunk);
        }

        await Promise.all(
            insertChunks.map((chunk, index) =>
                step.do(`insert product data into D1: chunk ${index + 1}`, async () => {
                    const statements = chunk.map(product =>
                        this.env.D1_DEMO.prepare(
                            `INSERT OR REPLACE INTO products (asin, price, product_url, flavour, images, productOverview) 
                             VALUES (?, ?, ?, ?, ?, ?)`
                        ).bind(
                            product.asin,
                            product.price,
                            product.product_url,
                            product.flavour,
                            JSON.stringify(product.images),
                            JSON.stringify(product.productOverview)
                        )
                    );

                    // Execute all prepared statements sequentially
                    for (const stmt of statements) {
                        await stmt.run();
                    }
                })
            )
        );
    }

    extractProductASINs(html: string, product_url: string) {
        const $ = cheerio.load(html);

        let asins: string[] = [];
        let parentAsin = '';

        // Extract parent and child ASINs
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
                    const dimensionToAsinMapString = `{${dimensionToAsinMapMatch[1]}}`; // Add braces to make it valid JSON
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
        }
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
        images = imageElements.map((i, el) => $(el).attr('src') || '').get();

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
        let url = new URL(req.url);

        if (url.pathname.startsWith('/favicon')) {
            return Response.json({}, { status: 404 });
        }

        // Get the status of an existing instance, if provided
        let id = url.searchParams.get('instanceId');
        if (id) {
            let instance = await env.MY_WORKFLOW.get(id);
            return Response.json({
                status: await instance.status(),
            });
        }

        // Spawn a new instance and return the ID and status
        let instance = await env.MY_WORKFLOW.create();
        return Response.json({
            id: instance.id,
            details: await instance.status(),
        });
    },
};
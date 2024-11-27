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
        // Step 1: Perform search and collect product URLs\
        const searchUrl = 'https://www.amazon.com/s?k=protein+powder';
        const productUrls = await step.do(
            'fetch search results page',
            {
                retries: {
                    limit: 5,
                    delay: '1 second',
                    backoff: "constant",
                },
                timeout: '30 seconds',
            },
            async () => {
                const resp = await fetch(searchUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.5',
                        'Accept-Encoding': 'gzip, deflate, br',
                        'DNT': '1',
                        'Connection': 'keep-alive',
                        'Upgrade-Insecure-Requests': '1'
                    }
                });

                if (!resp.ok) {
                    throw new Error(`Failed to fetch search page: ${resp.status} ${resp.statusText}`);
                }

                const html = await resp.text();
				const $ = cheerio.load(html);
				const urls: string[] = [];
				$('div[data-asin]').each((index: number, element: any) => {
					const asin = $(element).data('asin');
					if (asin) {
						const url = `https://www.amazon.com/dp/${asin}`;
						urls.push(url);
						// console.log('found product url: ', url);
					}
				});
				const urls2 = ['https://www.amazon.com/dp/B000GISU1M'];
                return urls2;
            }
        );


        // Step 2: Fetch each product page and extract information
		for (const productUrl of productUrls) {
            const productData = await step.do(
                `fetch and parse product page: ${productUrl}`,
                {
                    retries: {
                        limit: 1,
                        delay: '1 second',
                        backoff: "constant",
                    },
                    timeout: '30 seconds',
                },
                async () => {
                    const resp = await fetch(productUrl, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                            'Accept-Language': 'en-US,en;q=0.5',
                            'Accept-Encoding': 'gzip, deflate, br',
                            'DNT': '1',
                            'Connection': 'keep-alive',
                            'Upgrade-Insecure-Requests': '1'
                        }
                    });

                    if (!resp.ok) {
                        throw new Error(`Failed to fetch product page: ${resp.status} ${resp.statusText}`);
                    }

                    const html = await resp.text();
                    const productData = this.extractProductData(html, productUrl);
					console.log('extracted product data: ', productData);
                    return productData;
                }
            );

            // Step 3: Insert data into D1 database
            // await step.do(
            //     'insert product data into database',
            //     {
            //         retries: {
            //             limit: 1,
            //             delay: '1 second',
            //             backoff: "constant",
            //         },
            //         timeout: '30 seconds',
            //     },
            //     async () => {
            //         const insertStmt = this.env.D1_DEMO.prepare(`
            //             INSERT INTO Protein (price, product_url, flavour, brand, images, description)
            //             VALUES (?, ?, ?, ?, ?, ?)
            //         `);
            //         await insertStmt.run([
            //             productData.price,
            //             productData.product_url,
            //             productData.flavour,
            //             productData.brand,
            //             productData.images.join(','), // Store as comma-separated string
            //             productData.description
            //         ]);
            //     }
            // );
        }
    }


	extractProductData(html: string, product_url: string) {
        const $ = cheerio.load(html);
        
        let price = '';
        let flavour = '';
        let brand = '';
        let images: string[] = [];
        let description = '';
        let productOverview: Record<string, string> = {};
        let parentAsin = '';
        let childAsins: string[] = [];
        
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
        
        // Extract brand
        const brandElement = $('a.a-link-normal.a-text-normal');
        brand = brandElement.length ? brandElement.text().trim() : '';
        
        // Extract images from carousel
        const imageElements = $('div#imageBlock img');
        images = imageElements.map((i, el) => $(el).attr('src') || '').get();
        
        // Extract product description
        const descriptionElement = $('div#productDescription');
        description = descriptionElement.length ? descriptionElement.text().trim() : '';
        
        // Extract productOverview
        const productOverviewDiv = $('#productOverview_feature_div');
        if (productOverviewDiv.length) {
            const table = productOverviewDiv.find('table.a-normal.a-spacing-micro');
            const rows = table.find('tr');
            rows.each((index, element) => {
                const $row = $(element);
                const label = $row.find('td.a-span3 span.a-text-bold').text().trim();
                const value = $row.find('td.a-span9 span.po-break-word').text().trim();
                productOverview[label] = value;
            });
        }
        
        // Extract parent and child ASINs
        const scriptTags = $('script[type="text/javascript"]');
        scriptTags.each((index, script) => {
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
                        childAsins = Object.values(dimensionToAsinMap);
                    } catch (e) {
                        console.error('Error parsing dimensionToAsinMap:', e);
                    }
                }
            }
        });
        
        return {
            price,
            product_url: product_url,
            flavour,
            brand,
            images,
            description,
            productOverview,
            parentAsin,
            childAsins
        };
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
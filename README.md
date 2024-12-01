# Amazon Product Workflow Engine 🚀

A sophisticated serverless workflow engine built on Cloudflare Workers, designed to efficiently process and analyze Amazon product data at scale.

## 🏗️ Architecture

This project leverages cutting-edge serverless technologies:

- **Cloudflare Workers** - Edge computing platform for distributed processing
- **Cloudflare D1** - Serverless SQLite database for reliable data storage
- **Workflows API** - Orchestrates complex, multi-step data processing pipelines
- **TypeScript** - Ensures type safety and maintainable code

## 💾 Database Schema

The system uses a normalized database design:

```sql
products
  ├── asin (Primary Key)
  ├── price
  ├── product_url
  ├── flavour
  ├── servings_per_container
  ├── item_weight
  ├── material_type_free
  └── brand

images
  ├── image_id (Primary Key)
  ├── product_asin (Foreign Key)
  └── image_url
```

## 🚀 Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up local development database:
   ```bash
   wrangler d1 execute protein-db --file=./protein.sql
   ```

3. Run development server:
   ```bash
   npm run dev
   ```

## 🛠️ Development

This project uses:
- Wrangler for deployment and local development
- D1 for database management
- TypeScript for type-safe development

## 📦 Deployment

Deploy to production using:
```bash
wrangler deploy
```

## 🏗️ Technical Features

- **Serverless Architecture**: Zero infrastructure management
- **Edge Computing**: Global distribution for optimal performance
- **Type Safety**: Full TypeScript implementation
- **Database Migrations**: Version-controlled schema changes
- **Workflow Engine**: Complex data processing pipelines
- **Modern Development**: Latest ES6+ features

## 🔒 Security

- Secure database connections
- Environment-based configurations
- No sensitive data exposure

## 📈 Performance

- Edge-optimized computing
- Efficient database queries
- Minimal latency design

---
Built with ❤️ using Cloudflare Workers and D1

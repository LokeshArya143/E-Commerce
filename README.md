# Rama Sarees

Responsive storefront for sarees and dresses. index.html is the Vercel frontend. backend/ is a Render API backed by PostgreSQL with a protected owner portal.

## Render API and database

1. Sign in to Render and choose New → Blueprint.
2. Connect LokeshArya143/E-Commerce and choose render.yaml.
3. Set ADMIN_EMAIL and a unique strong ADMIN_PASSWORD when prompted. Render generates the JWT secret and wires the database URL.
4. Verify https://rama-sarees-api.onrender.com/api/health. The API inserts 50 sample sarees and 12 sample dresses on first start.

## Vercel storefront

1. Sign in to Vercel and choose Add New → Project.
2. Import LokeshArya143/E-Commerce, keep the root at /, and select Other as the framework preset.
3. Deploy. Vercel serves index.html from the repository root.
4. api-config.js points to the Render service address. Update it if Render gives the API a different URL and push the change.

## Before sharing the shop

Replace the WhatsApp placeholder, sample inventory, product photos and descriptions, reviews, address, hours, and social links with accurate shop details. Render's free web service can sleep when idle, and its free PostgreSQL database expires after 30 days. Use a paid database for long-term product storage. Never commit admin credentials.

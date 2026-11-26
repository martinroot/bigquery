# bigquery.live

AI analytics workbench — static site served at https://bigquery.live/

Pipeline: BigQuery (data source) → Metabase (approved saved questions) →
OpenRouter (model / report plan) → Python + BI (rows → report).

Deployment: files served by nginx from `/var/www/bigquery.live`
(SSL via Let's Encrypt / Certbot).

Stack is intentionally static: `index.html` + `app.js` + `styles.css` + `mark.svg`.

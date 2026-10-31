# Making media.mematdigi.com load fast (server side)

The frontend is now code-split: every page is its own file in `build/static/js`,
and the file names contain a content hash. To get the full speed benefit, the
server should **compress** files and let browsers **cache the hashed files forever**.

Add this inside the `server { … }` block that serves the React build in Nginx,
then run `sudo nginx -t && sudo systemctl reload nginx`.

```nginx
# ── Compression ────────────────────────────────────────────────
gzip on;
gzip_comp_level 6;
gzip_min_length 1024;
gzip_vary on;
gzip_proxied any;
gzip_types text/css application/javascript application/json image/svg+xml text/plain font/woff2;

# ── Hashed build assets: cache for a year ──────────────────────
location /static/ {
    expires 1y;
    add_header Cache-Control "public, max-age=31536000, immutable";
    try_files $uri =404;
}

# ── index.html must always be fresh (so new deploys show up) ───
location = /index.html {
    add_header Cache-Control "no-cache";
}

# ── SPA routing ────────────────────────────────────────────────
location / {
    try_files $uri /index.html;
}
```

Also recommended:

* Enable HTTP/2 on the HTTPS listener: `listen 443 ssl http2;`
* Build without source maps for production: `GENERATE_SOURCEMAP=false npm run build`
  (smaller upload; source maps are not needed by users).
* Keep the API on the same domain or keep the `preconnect` in `public/index.html`
  pointing at the API origin (already set to `https://media.mematdigi.com`).

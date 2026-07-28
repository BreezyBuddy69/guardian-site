# Guardian marketing/download site. Zero npm dependencies (see server/index.js)
# — small image, nothing to audit for supply-chain risk.

FROM node:24-alpine
ENV NODE_ENV=production \
    PORT=8080

RUN addgroup -S app && adduser -S app -G app
WORKDIR /app

COPY package.json ./
COPY server/ ./server/
COPY public/ ./public/
RUN chown -R app:app /app
USER app

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]

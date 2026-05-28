FROM node:22-alpine

WORKDIR /app

# Copy pre-built output and the production node_modules from the host.
# This avoids running npm install inside the container, which can fail
# on networks with restricted DNS (e.g. Synology Docker environments).
COPY dist/ ./dist/
COPY node_modules/ ./node_modules/
COPY package.json ./

EXPOSE 9001

ENV PORT=9001

USER node

CMD ["node", "dist/server.js"]


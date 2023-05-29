FROM node:lts-alpine

RUN npm install -g npm@latest
WORKDIR /app
COPY app/package*.json /app/
RUN npm ci --omit dev --ignore-scripts

EXPOSE 8080

RUN apk --no-cache add curl
HEALTHCHECK --interval=3s --timeout=1s --start-period=3s --retries=3 \
    CMD curl --silent --fail http://localhost:8080/healthcheck || exit 1

ENTRYPOINT [ "node" ]
CMD [ "index.js" ]

COPY app/ /app/

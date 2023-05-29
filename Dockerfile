FROM node:lts-alpine

RUN npm install -g npm@latest

WORKDIR /app
COPY app/ /app/
RUN npm ci

EXPOSE 8080

HEALTHCHECK --interval=3s --timeout=1s --start-period=3s --retries=3 \
    CMD curl --silent --fail http://localhost/healthcheck || exit 1

ENTRYPOINT [ "node" ]
CMD [ "index.js" ]

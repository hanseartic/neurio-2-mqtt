FROM node:lts-alpine

ENV NPM_CONFIG_UPDATE_NOTIFIER=false
WORKDIR /app
COPY app/package*.json /app/
RUN npm i --omit dev --ignore-scripts

EXPOSE 8080

HEALTHCHECK --interval=60s --timeout=30s --start-period=15s --retries=3 \
    CMD wget http://localhost:8080/healthcheck -q -O -

ENTRYPOINT [ "node" ]
CMD [ "index.js" ]

COPY app/ /app/

ARG version="0"
ENV VERSION=$version

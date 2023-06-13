FROM node:lts-alpine

ENV NPM_CONFIG_UPDATE_NOTIFIER=false
WORKDIR /app
COPY app/package*.json /app/
RUN npm i --omit dev --ignore-scripts

EXPOSE 8080

RUN apk --no-cache add curl
HEALTHCHECK --interval=3s --timeout=1s --start-period=3s --retries=3 \
    CMD curl --silent --fail http://localhost:8080/healthcheck || exit 1

ENTRYPOINT [ "node" ]
CMD [ "index.js" ]

COPY app/ /app/

FROM node:lts-alpine

RUN npm install -g npm@latest

WORKDIR /app
COPY app/ /app/
RUN npm ci

EXPOSE 8080

ENTRYPOINT [ "node" ]
CMD [ "index.js" ]

FROM node:18-alpine AS BUILD_IMAGE
WORKDIR /app
COPY package.json package-lock.json ./

# install dependencies
RUN npm ci --frozen-lockfile
COPY . .

# generate Prisma Client
RUN npx prisma generate

# set environment variables
ARG SENTRY_AUTH_TOKEN
ENV SENTRY_AUTH_TOKEN=$SENTRY_AUTH_TOKEN

# build
RUN npm run build

FROM node:18-alpine
WORKDIR /app

ENV NODE_ENV production

RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

# copy from build image
COPY --from=BUILD_IMAGE /app/package.json ./package.json
COPY --from=BUILD_IMAGE /app/node_modules ./node_modules
COPY --from=BUILD_IMAGE /app/.next ./.next
COPY --from=BUILD_IMAGE /app/public ./public
COPY --from=BUILD_IMAGE /app/prisma ./prisma

USER nextjs

EXPOSE 3000

ENV PORT 3000

CMD ["npm", "run", "migrate:start"]
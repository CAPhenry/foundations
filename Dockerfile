# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS build

WORKDIR /workspace

COPY package.json package-lock.json ./
COPY resources/hmp-mysql/package.json resources/hmp-mysql/package.json
RUN npm ci

COPY . .
RUN npm run verify

FROM scratch AS pack

LABEL org.opencontainers.image.title="HMP Foundation" \
      org.opencontainers.image.description="Versioned HogwartsMP server resource pack" \
      org.opencontainers.image.licenses="LicenseRef-MafiaHub-OSS"

COPY --from=build /workspace/build/hmp-foundation/foundation.json /foundation.json
COPY --from=build /workspace/build/hmp-foundation/resources/ /resources/

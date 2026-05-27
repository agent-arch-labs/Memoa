FROM rust:1.77-slim-bookworm AS builder

RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY Cargo.toml Cargo.lock* ./
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release 2>/dev/null || true

COPY . .
RUN touch src/main.rs
RUN cargo build --release

FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y ca-certificates libssl3 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /build/target/release/nexus /app/nexus
COPY --from=builder /build/.env.example /app/.env.example

RUN mkdir -p /app/data

EXPOSE 3721

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD [ "curl", "-f", "http://localhost:3721/api/v1/health" ] || exit 1

ENTRYPOINT ["/app/nexus"]
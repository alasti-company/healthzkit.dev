# Real-service integration tests

These tests use disposable services, real driver connections, and the adapter source.
Ordinary `vp test` / `vp run -r test` runs skip them unless `HEALTHZKIT_INTEGRATION=1`.
Build first so workspace dependencies resolve. Docker Engine and Compose v2 with
`up --wait` support are required for the provided environment.

## Run locally

```bash
vp install
vp run -r build
# Always clean up, including partial startup and failed tests.
trap 'docker compose -f tools/integration/compose.yml down -v --remove-orphans --timeout 10' EXIT
docker compose -f tools/integration/compose.yml up -d --wait --wait-timeout 180
export HEALTHZKIT_POSTGRES_URL=postgres://healthzkit:healthzkit@127.0.0.1:55432/healthzkit
export HEALTHZKIT_REDIS_URL=redis://127.0.0.1:56379
export HEALTHZKIT_RABBITMQ_URL=amqp://healthzkit:healthzkit@127.0.0.1:55672
export HEALTHZKIT_KAFKA_URL=127.0.0.1:59092
export HEALTHZKIT_MYSQL_URL=mysql://healthzkit:healthzkit@127.0.0.1:53306/healthzkit
export HEALTHZKIT_MONGO_URL=mongodb://127.0.0.1:57017/healthzkit
vp run --no-cache test:integration
```

In PowerShell, assign environment variables with `$env:HEALTHZKIT_MYSQL_URL = 'mysql://...'`.
Use `try { docker compose -f tools/integration/compose.yml up -d --wait --wait-timeout 180; vp run --no-cache test:integration } finally { docker compose -f tools/integration/compose.yml down -v --remove-orphans --timeout 10 }`
for startup, execution and teardown.

To run a subset, start only its services and pass package names:

```bash
docker compose -f tools/integration/compose.yml up -d --wait --wait-timeout 180 rabbitmq kafka mysql mongo
vp run --no-cache test:integration rabbitmq kafka mysql mongo
```

The Node runner sets `HEALTHZKIT_INTEGRATION=1` on Windows and Unix, disables nested
task caching, runs each suite once, and imposes a three-minute process ceiling.
Use the outer `--no-cache` too so cached root tasks cannot suppress execution.
Only selected suites require their URLs. URLs may point to other **disposable**
services; Kafka uses `host:port`, not a URL scheme. Advertised Kafka listeners must
be reachable from the host running tests. Compose's external listener is fixed to
`127.0.0.1:59092`; the internal listener is used for container health checks.

## Coverage and versions

| Service image                          | Real driver coverage                     | Scenarios                                                                                                               |
| -------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Postgres 17 Alpine                     | `pg` 8                                   | Repeated probes, SQL error, pool reuse/release, refused connection                                                      |
| Redis 7 Alpine                         | `ioredis` 5                              | Repeated probes, command error, caller reuse, refused connection                                                        |
| RabbitMQ 4.1 Alpine                    | `amqplib` 2, `amqp-connection-manager` 5 | Repeated channel/connection probes, closed-connection operation, refused handshake, disconnected manager, owner cleanup |
| Apache Kafka 3.9.1 (single-node KRaft) | `kafkajs` 2                              | Repeated cluster probes, invalid-topic broker error through metadata, caller admin reuse, refused connection            |
| MySQL 8.4                              | `mysql2` 3 promise pool                  | Repeated probes with a one-connection pool, SQL error and recovery, refused connection, owner cleanup                   |
| MongoDB 8.0                            | `mongodb` 7, Mongoose 9                  | Repeated pings, unknown-command server error through metadata, caller reuse, refused connection, owner cleanup          |

Exact driver patch versions are locked in `pnpm-lock.yaml`. These are configured service
versions, not a claim that every peer dependency version has integration coverage.
Other driver versions and topologies (TLS/authentication failures, replication,
Kafka ACLs and multi-broker failover) remain outside this suite. `mysql` 2 and
`node-rdkafka` 3 remain mock-tested; mysql 2 does not support MySQL 8.4's default
authentication. Other existing adapter gaps include `postgres`, `redis`, `upstash`,
and the service packages not listed here.

## Time limits and ownership

New suites have 15-second test deadlines; connections/requests/server selection
use one-second driver bounds, Kafka retries are disabled, and MongoDB read/write
retries are disabled. MySQL disables pool queuing and sets a one-second server
SELECT execution limit. RabbitMQ manager startup has a two-second ceiling and
the owner closes managers to stop reconnect timers. CI also bounds Compose startup
to 180 seconds and the whole job to 15 minutes. Test/process deadlines are fallback
ceilings, not cancellation APIs for driver operations.

Successful connections, pools and Mongoose instances are caller-owned and closed
in `finally`; the Kafka adapter disconnects each temporary admin while an independent
caller admin verifies continued usability. Refused ports are temporarily reserved
on loopback and released before probing (a small OS port-reuse race is possible).
The amqplib refused-connection case uses URL mode but never acquires a connection.
No suite depends on the disposal API planned in #83. Add library-owned disposal
coverage after that API lands; these tests deliberately preserve client injection.

MongoDB/Kafka operation failures run real server commands inside metadata callbacks;
they test error translation and subsequent client usability. RabbitMQ tests create
an exclusive auto-deleted queue, Kafka requests an invalid empty topic, and database
queries do not write application data. Do not point the suites at production.

CI captures Compose logs on failure and tears down with `if: always()`, including
after startup/test failures. For local diagnosis use
`docker compose -f tools/integration/compose.yml logs --no-color` before teardown.

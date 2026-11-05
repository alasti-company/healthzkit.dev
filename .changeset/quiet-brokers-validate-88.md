---
"@healthzkit/rabbitmq": patch
"@healthzkit/kafka": patch
"@healthzkit/mysql": patch
"@healthzkit/mongo": patch
---

Add opt-in real-service validation for amqplib, amqp-connection-manager, KafkaJS,
mysql2, MongoDB and Mongoose, covering repeated probes, failures and caller-owned
client cleanup. Add disposable Compose services and CI execution; no runtime API changes.

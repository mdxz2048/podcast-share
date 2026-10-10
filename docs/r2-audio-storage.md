# R2 audio storage

Set `R2_CONFIG_PATH` in the Runner environment to a protected JSON file containing `endpoint`, `bucket`, `accessKeyId`, and `secretAccessKey`. Keep it outside the checkout and restrict access to the service account. Set `R2_PUBLIC_BASE_URL` in the API environment to the public bucket base URL. Without Runner R2 configuration, imports retain local storage behavior.

Connectors continue emitting `media_ready` with local paths. Runner creates a local recovery copy, streams the upload, and verifies object size and SHA-256 metadata. Object keys contain a hash of Source ID plus external episode ID and a hash of the content. Identical retries reuse the object; different Sources do not collide.

Only verified objects become `r2` media records. The API removes the local recovery copy after database insertion. Failed uploads retain the recovery copy. RSS enclosures use permanent public R2 URLs; existing website media URLs redirect after the usual permission checks. Public R2 URLs can be shared without website authentication. `r2.dev` is rate-limited and can be replaced with a custom domain via the API setting.

Deduplication uses external episode IDs with a `ready` media record, regardless of local or R2 storage. Metadata-only episodes remain eligible for retry. Both current duoting and Fafa connectors already accept this list. No Telegram authentication or connector session files are changed.

Historical migration uploads one referenced file at a time, records a rollback receipt, switches its media record only after verification, and deletes the original file only after checking playback and RSS output. Do not manually remove container state or authentication files as part of migration.

The initial Runner implementation uploads after the connector finishes. It still needs temporary disk space for a batch. Limit batch sizes; a future per-episode streaming protocol can reduce this to approximately one episode. Removing Source metadata does not currently delete R2 objects; clean up unreferenced objects through an audited inventory, not bucket-wide deletion.

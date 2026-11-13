"""The Schema versions the writers in the pipeline stamp on the contract files they write.

`SCHEMA_VERSION` is the stamp of every contract file except an evidence file. It stays 1.1.0 at
Schema 1.2.0, which changed only `provenance.review` in evidence features (spec 06 requirement
9.1): a control file is pinned by the SHA-256 in its alignment record, and a map area file and an
alignment record by the proposals and tile sidecars made from them, so stamping them again would
make every record stale for no change in what they say. The Validator does not require a stamp on
those files.

`EVIDENCE_SCHEMA_VERSION` is the stamp of an evidence file. The Validator requires at least this
for a file whose features carry `provenance.review`.
"""

SCHEMA_VERSION = "1.1.0"
EVIDENCE_SCHEMA_VERSION = "1.2.0"

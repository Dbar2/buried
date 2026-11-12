"""The Schema version every writer in the pipeline stamps on the contract files it writes.

It moves with `data/schema/evidence.schema.json` (spec 01 requirement 1.5): a schema change bumps
this constant and every committed contract file in the same change.
"""

SCHEMA_VERSION = "1.1.0"

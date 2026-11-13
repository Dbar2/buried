"""The Studio service (spec 04): the pipeline's own functions behind HTTP.

It computes nothing the CLI does not compute. It is stateless: it keeps no result of any request,
and writes to no file under the repository (requirements 1.3 to 1.7).
"""

SERVICE_VERSION = "0.1.0"
API_VERSION = "1.0.0"

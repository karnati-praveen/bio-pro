"""Session-wide test fixtures.

Sets DESIGNS_DB at module level and imports shared.db.db immediately so the
SQLAlchemy engine is created before any test module's module-level code can
override the env var.  This ensures all test files share one writable temp DB
for the whole pytest session, regardless of collection order or which subset of
files is passed on the command line.
"""

import atexit
import os
import tempfile

_TMP_DB = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_TMP_DB.close()
os.environ["DESIGNS_DB"] = _TMP_DB.name
os.environ.setdefault("LLM_PARSER", "off")

# Force engine creation now — subsequent `import shared.db.db` calls (from test
# modules that also set DESIGNS_DB) will hit the sys.modules cache and reuse
# this engine rather than spinning up a new one pointing at a different file.
from shared.db.db import init_db  # noqa: E402

atexit.register(lambda: os.path.exists(_TMP_DB.name) and os.unlink(_TMP_DB.name))

import pytest  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _init_test_db():
    init_db()

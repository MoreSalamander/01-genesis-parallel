"""Test configuration: force mock mode with an isolated data dir BEFORE any app
module (and thus app.config's env-read) is imported by the tests."""
import os
import tempfile

os.environ["GENESIS_MOCK"] = "1"
os.environ["GENESIS_DATA_DIR"] = tempfile.mkdtemp(prefix="genesis-parallel-test-")
os.environ.pop("PARALLEL_API_KEY", None)
os.environ.pop("GOOGLE_API_KEY", None)
os.environ.pop("GEMINI_API_KEY", None)

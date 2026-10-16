import pytest
from fastapi.testclient import TestClient

import app.main as main
from app.config import Settings


@pytest.fixture
def site(database_url, tmp_path, monkeypatch):
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<html>app</html>", encoding="utf-8")
    (dist / "assets" / "app-3f9a1c.js").write_text("console.log(1)", encoding="utf-8")
    monkeypatch.setattr(main, "STATIC_ROOT", dist)
    app = main.create_app(Settings(database_url=database_url, api_key="test-key"))
    with TestClient(app) as client:
        yield client


def test_the_page_is_rechecked_so_a_new_version_reaches_everybody(site):
    assert site.get("/").headers["cache-control"] == "no-cache"
    assert site.get("/index.html").headers["cache-control"] == "no-cache"


def test_built_files_with_a_hash_in_their_name_are_kept_for_good(site):
    response = site.get("/assets/app-3f9a1c.js")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "public, max-age=31536000, immutable"


def test_api_answers_are_left_alone(site):
    assert "cache-control" not in site.get("/health").headers

import importlib.util
import sys
import threading
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "deploy.py"
TOKEN = "y0__xDemoToken-1234567890_abcdef"


@pytest.fixture(scope="module")
def deploy():
    spec = importlib.util.spec_from_file_location("deploy_token", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


@pytest.fixture(autouse=True)
def no_real_browser(deploy, monkeypatch):
    """No test may ever open a real browser window."""
    monkeypatch.setattr(deploy.webbrowser, "open", lambda url: None)


def post(url, body):
    request = urllib.request.Request(url, data=body.encode(), method="POST")
    try:
        with urllib.request.urlopen(request, timeout=5) as reply:
            return reply.status
    except urllib.error.HTTPError as error:
        return error.code


def test_the_page_reads_the_token_from_the_address_and_hands_it_over(deploy):
    catcher = deploy.TokenCatcher(port=0)
    catcher.start()
    try:
        with urllib.request.urlopen(catcher.redirect_uri, timeout=5) as reply:
            page = reply.read().decode("utf-8")
        assert "access_token" in page and "fetch('/token'" in page
        assert catcher.redirect_uri.startswith("http://localhost:")
        assert post(catcher.redirect_uri + "token", TOKEN) == 204
        assert catcher.wait(1) == TOKEN
    finally:
        catcher.stop()


def test_only_something_that_looks_like_a_token_is_accepted(deploy):
    catcher = deploy.TokenCatcher(port=0)
    catcher.start()
    try:
        assert post(catcher.redirect_uri + "token", "short") == 400
        assert post(catcher.redirect_uri + "token", "has spaces and symbols <script> " * 2) == 400
        assert post(catcher.redirect_uri + "other", TOKEN) == 400  # only /token takes it
        assert catcher.token is None
        assert catcher.wait(0.3) is None
    finally:
        catcher.stop()


def test_the_link_asks_yandex_to_come_back_to_this_computer(deploy):
    plain = deploy.authorize_url("abc123def4")
    assert plain == "https://oauth.yandex.ru/authorize?response_type=token&client_id=abc123def4"
    back = deploy.authorize_url("abc123def4", "http://localhost:8765/")
    assert back.endswith("&redirect_uri=http%3A%2F%2Flocalhost%3A8765%2F")


def test_the_token_comes_back_by_itself(deploy, monkeypatch):
    monkeypatch.setattr("builtins.input", lambda prompt="": "y")

    def browser(url):
        # What the page does after Yandex redirects the browser: send the token to this computer.
        target = urllib.parse.unquote(url.split("redirect_uri=")[1])
        threading.Thread(target=post, args=(target + "token", TOKEN), daemon=True).start()

    monkeypatch.setattr(deploy.webbrowser, "open", browser)
    assert deploy.get_yandex_token("abc123def4", port=0, timeout=10) == TOKEN


def test_without_the_token_coming_back_it_can_be_pasted(deploy, monkeypatch):
    monkeypatch.setattr("builtins.input", lambda prompt="": "y")
    monkeypatch.setattr(deploy.getpass, "getpass", lambda prompt="": "  pasted-token  ")
    monkeypatch.setattr(deploy.webbrowser, "open", lambda url: None)  # nothing comes back
    assert deploy.get_yandex_token("abc123def4", port=0, timeout=0.3) == "pasted-token"


def test_the_manual_way_does_not_start_anything_on_this_computer(deploy, monkeypatch):
    monkeypatch.setattr("builtins.input", lambda prompt="": "n")
    monkeypatch.setattr(deploy.getpass, "getpass", lambda prompt="": "by-hand-token")
    opened = []
    monkeypatch.setattr(deploy.webbrowser, "open", opened.append)
    assert deploy.get_yandex_token("abc123def4", port=0) == "by-hand-token"
    assert opened == []


def test_a_busy_port_falls_back_to_pasting(deploy, monkeypatch):
    holder = deploy.TokenCatcher(port=0)
    holder.start()
    try:
        monkeypatch.setattr("builtins.input", lambda prompt="": "y")
        monkeypatch.setattr(deploy.getpass, "getpass", lambda prompt="": "by-hand-token")
        busy = holder.server.server_port
        assert deploy.get_yandex_token("abc123def4", port=busy) == "by-hand-token"
    finally:
        holder.stop()


def test_the_prompt_tells_where_to_get_the_app_id(deploy):
    help_text = deploy.YANDEX_APP_HELP
    assert "https://oauth.yandex.ru/client/new" in help_text
    assert "https://oauth.yandex.ru/verification_code" in help_text
    assert f"http://localhost:{deploy.YANDEX_CALLBACK_PORT}/" in help_text
    assert "Доступ к папке приложения" in help_text

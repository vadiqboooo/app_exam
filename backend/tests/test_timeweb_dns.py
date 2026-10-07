import importlib.util
import io
import sys
import urllib.error
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "deploy.py"
IP = "203.0.113.10"


@pytest.fixture(scope="module")
def deploy():
    spec = importlib.util.spec_from_file_location("deploy_dns", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class FakeTimeweb:
    """Answers like the Timeweb Cloud API and remembers what was asked of it."""

    def __init__(self, zones=("school.example",), records=(), flat=False):
        self.zones, self.records, self.flat, self.calls = list(zones), list(records), flat, []

    def __call__(self, token, method, path, body=None):
        self.calls.append((method, path, body))
        assert token == "tw-token"
        if method == "GET" and path == "/domains":  # no paging parameters on the first request
            domains = [{"id": 1, "fqdn": zone} for zone in self.zones]
            return {"domains": domains, "meta": {"total": 1}}
        if method == "GET" and "/dns-records" in path:
            return {"dns_records": [self.shape(r) for r in self.records], "meta": {"total": 1}}
        if method in {"POST", "DELETE"}:
            return {}
        raise AssertionError(f"unexpected call {method} {path}")

    def shape(self, item):
        if self.flat:  # the answer may also carry the fields at the top
            return {"id": item["id"], "type": item["type"], **item["data"]}
        return item


def record(identifier, kind, subdomain, value):
    return {"id": identifier, "type": kind, "data": {"subdomain": subdomain, "value": value}}


def writes(api):
    return [(method, path) for method, path, _ in api.calls if method in {"POST", "DELETE"}]


def test_the_account_domain_that_fits_is_found(deploy):
    zones = ["school.example", "example", "other.org"]
    assert deploy.split_domain("exam.school.example", zones) == ("school.example", "exam")
    assert deploy.split_domain("a.b.school.example", zones) == ("school.example", "a.b")
    assert deploy.split_domain("school.example", zones) == ("school.example", "")
    assert deploy.split_domain("EXAM.School.Example", zones) == ("school.example", "exam")
    assert deploy.split_domain("exam.nothing.net", zones) is None
    assert deploy.split_domain("notschool.example", ["school.example"]) is None  # not a subdomain


def test_a_missing_record_is_created_for_the_subdomain(deploy, monkeypatch):
    api = FakeTimeweb(records=[record(7, "MX", "", "mail.school.example")])
    monkeypatch.setattr(deploy, "timeweb_call", api)
    message = deploy.point_domain("tw-token", "exam.school.example", IP, lambda *a: False)
    assert "создана A-запись" in message
    assert writes(api) == [("POST", "/domains/school.example/dns-records")]
    assert api.calls[-1][2] == {"type": "A", "value": IP, "subdomain": "exam"}


def test_a_record_that_is_already_right_is_left_alone(deploy, monkeypatch):
    for flat in (False, True):
        api = FakeTimeweb(records=[record(5, "A", "exam", IP)], flat=flat)
        monkeypatch.setattr(deploy, "timeweb_call", api)
        message = deploy.point_domain("tw-token", "exam.school.example", IP, lambda *a: False)
        assert "уже указывает" in message and writes(api) == []


def test_another_address_is_replaced_only_when_the_person_agrees(deploy, monkeypatch):
    old = [record(5, "A", "exam", "198.51.100.7")]
    api = FakeTimeweb(records=old)
    monkeypatch.setattr(deploy, "timeweb_call", api)
    asked = []

    def refuse(domain, shown, ip):
        asked.append((domain, shown, ip))
        return False

    with pytest.raises(deploy.DeployError, match="не заменена"):
        deploy.point_domain("tw-token", "exam.school.example", IP, refuse)
    assert asked == [("exam.school.example", "A 198.51.100.7", IP)] and writes(api) == []

    agreed = FakeTimeweb(records=old)
    monkeypatch.setattr(deploy, "timeweb_call", agreed)
    deploy.point_domain("tw-token", "exam.school.example", IP, lambda *a: True)
    assert writes(agreed) == [
        ("DELETE", "/domains/school.example/dns-records/5"),
        ("POST", "/domains/school.example/dns-records"),
    ]


def test_a_cname_in_the_way_counts_as_another_address(deploy, monkeypatch):
    api = FakeTimeweb(records=[record(9, "CNAME", "exam", "elsewhere.example")])
    monkeypatch.setattr(deploy, "timeweb_call", api)
    with pytest.raises(deploy.DeployError, match="CNAME elsewhere.example"):
        deploy.point_domain("tw-token", "exam.school.example", IP, lambda *a: False)
    assert writes(api) == []


def test_records_of_other_names_are_never_touched(deploy, monkeypatch):
    records = [record(1, "A", "www", "198.51.100.7"), record(2, "A", "", "198.51.100.8")]
    api = FakeTimeweb(records=records)
    monkeypatch.setattr(deploy, "timeweb_call", api)
    deploy.point_domain("tw-token", "exam.school.example", IP, lambda *a: False)
    assert writes(api) == [("POST", "/domains/school.example/dns-records")]


def test_a_domain_that_is_not_in_the_account_is_reported(deploy, monkeypatch):
    monkeypatch.setattr(deploy, "timeweb_call", FakeTimeweb(zones=["other.org"]))
    with pytest.raises(deploy.DeployError, match="нет в вашем аккаунте"):
        deploy.point_domain("tw-token", "exam.school.example", IP, lambda *a: False)


def test_the_main_domain_itself_gets_a_record_without_a_subdomain(deploy, monkeypatch):
    api = FakeTimeweb()
    monkeypatch.setattr(deploy, "timeweb_call", api)
    deploy.point_domain("tw-token", "school.example", IP, lambda *a: False)
    assert api.calls[-1][2] == {"type": "A", "value": IP}


def test_a_refused_token_is_explained(deploy, monkeypatch):
    def refuse(request, timeout=0):
        raise urllib.error.HTTPError(request.full_url, 401, "no", {}, io.BytesIO(b"{}"))

    monkeypatch.setattr(deploy.urllib.request, "urlopen", refuse)
    with pytest.raises(deploy.DeployError, match="не принял токен"):
        deploy.timeweb_call("bad", "GET", "/domains")


def make_config(deploy, **options):
    values = {
        "host": IP,
        "port": 22,
        "user": "root",
        "password": "pw",
        "domain": "exam.school.example",
        "email": "me@school.example",
        "yandex_client_id": None,
        "yandex_token": None,
        "dry_run": False,
        "yes": True,
        "skip_build": True,
        "restore_latest": False,
        "action": "deploy",
        "delete_data": False,
    }
    values.update(options)
    return deploy.Config(**values)


def test_the_token_is_sent_as_a_bearer_and_hidden_from_errors(deploy, monkeypatch):
    seen = {}

    def reply(request, timeout=0):
        seen["auth"] = request.get_header("Authorization")
        seen["url"] = request.full_url
        return type(
            "Reply",
            (),
            {"__enter__": lambda s: s, "__exit__": lambda *a: None, "read": lambda s: b"{}"},
        )()

    monkeypatch.setattr(deploy.urllib.request, "urlopen", reply)
    deploy.timeweb_call("tw-secret", "GET", "/domains")
    assert seen["auth"] == "Bearer tw-secret"
    assert seen["url"] == "https://api.timeweb.cloud/api/v1/domains"
    assert "tw-secret" in make_config(deploy, timeweb_token="tw-secret").secrets


class Server:
    """A server whose view of the domain changes after a few looks."""

    def __init__(self, answers):
        self.answers, self.asked, self.last = list(answers), 0, ""

    def run(self, command, check=True, timeout=0):
        self.asked += 1
        self.last = self.answers.pop(0) if self.answers else self.last
        return type("Result", (), {"code": 0, "out": self.last + "\n", "err": ""})()


class Notes:
    def __init__(self):
        self.lines = []

    def note(self, text):
        self.lines.append(text)


def test_https_waits_until_the_domain_reaches_the_server(deploy, monkeypatch):
    monkeypatch.setattr(deploy.time, "sleep", lambda seconds: None)
    server, step = Server(["", "198.51.100.7", IP]), Notes()
    assert deploy.wait_for_dns(server, make_config(deploy), "exam.school.example", step)
    assert server.asked == 3 and any("жду" in line for line in step.lines)


def test_waiting_gives_up_when_the_domain_never_arrives(deploy, monkeypatch):
    monkeypatch.setattr(deploy.time, "sleep", lambda seconds: None)
    server, step = Server(["198.51.100.7"]), Notes()
    done = deploy.wait_for_dns(server, make_config(deploy), "exam.school.example", step, timeout=0)
    assert not done and any("так и не стал" in line for line in step.lines)


def test_a_dry_run_never_calls_timeweb_or_waits(deploy, monkeypatch):
    def boom(*args, **kwargs):
        raise AssertionError("no network in a dry run")

    monkeypatch.setattr(deploy, "timeweb_call", boom)
    cfg = make_config(deploy, dry_run=True, timeweb_token="tw-secret")
    plan = deploy.Plan(8000, 80, True, False, "exam.school.example", [])
    step = Notes()
    deploy.link_domain(cfg, plan, step)
    assert any("пропущена" in line for line in step.lines)
    assert deploy.wait_for_dns(Server([]), cfg, "exam.school.example", step)


def test_without_a_token_the_person_is_told_what_record_to_make(deploy):
    plan = deploy.Plan(8000, 80, True, False, "exam.school.example", [])
    step = Notes()
    deploy.link_domain(make_config(deploy), plan, step)
    text = " ".join(step.lines)
    assert "тип A" in text and "exam.school.example" in text and IP in text


def test_a_failure_at_timeweb_falls_back_to_the_manual_way(deploy, monkeypatch):
    def broken(*args, **kwargs):
        raise deploy.DeployError("Timeweb ответил ошибкой 500")

    monkeypatch.setattr(deploy, "timeweb_call", broken)
    plan = deploy.Plan(8000, 80, True, False, "exam.school.example", [])
    step = Notes()
    deploy.link_domain(make_config(deploy, timeweb_token="tw-token"), plan, step)
    assert any("ошибкой 500" in line for line in step.lines)
    assert any("тип A" in line for line in step.lines)  # the manual way is still offered


ARGS = ["--dry-run", "--yes", "--host", IP, "--domain", "exam.school.example", "--email", "a@b.cc"]


def test_the_whole_deploy_dry_run_with_a_domain_and_a_token(deploy, monkeypatch, capsys):
    monkeypatch.setenv("DEPLOY_PASSWORD", "secret-pass")
    monkeypatch.setattr(deploy, "STATE_FILE", Path("does-not-exist/.deploy.json"))
    code = deploy.main(ARGS + ["--timeweb-token", "tw-secret", "--replace-dns"])
    out = capsys.readouterr().out
    assert code == 0 and "Подключаю домен exam.school.example и HTTPS" in out
    assert "запись в Timeweb пропущена" in out and "certbot --nginx -d exam.school.example" in out
    assert "tw-secret" not in out and "secret-pass" not in out


def test_the_token_can_come_from_the_environment(deploy, monkeypatch):
    monkeypatch.setenv("DEPLOY_PASSWORD", "secret-pass")
    monkeypatch.setenv("TIMEWEB_TOKEN", "from-env")
    monkeypatch.setattr(deploy, "STATE_FILE", Path("does-not-exist/.deploy.json"))
    cfg = deploy.collect(deploy.parse_args(ARGS))
    assert cfg.timeweb_token == "from-env" and cfg.replace_dns is False
    assert deploy.collect(deploy.parse_args(ARGS + ["--replace-dns"])).replace_dns is True


def failing(code, body):
    def reply(request, timeout=0):
        raise urllib.error.HTTPError(request.full_url, code, "bad", {}, io.BytesIO(body))

    return reply


def test_a_400_says_which_request_failed_and_what_timeweb_wants(deploy, monkeypatch):
    body = b'{"status_code":400,"message":["value must be an IP address","type is invalid"]}'
    monkeypatch.setattr(deploy.urllib.request, "urlopen", failing(400, body))
    with pytest.raises(deploy.DeployError) as caught:
        deploy.timeweb_call("tw-token", "POST", "/domains/school.example/dns-records", {})
    text = str(caught.value)
    assert "400" in text and "POST /domains/school.example/dns-records" in text
    assert "value must be an IP address; type is invalid" in text


def test_an_answer_that_is_not_json_is_still_shown(deploy, monkeypatch):
    monkeypatch.setattr(deploy.urllib.request, "urlopen", failing(400, b"Bad Request: nope"))
    with pytest.raises(deploy.DeployError, match="Bad Request: nope"):
        deploy.timeweb_call("tw-token", "GET", "/domains")
    monkeypatch.setattr(deploy.urllib.request, "urlopen", failing(500, b""))
    with pytest.raises(deploy.DeployError) as caught:
        deploy.timeweb_call("tw-token", "GET", "/domains")
    assert str(caught.value).endswith("(GET /domains)")  # nothing to add, nothing invented


def test_long_lists_are_read_page_by_page_without_a_limit(deploy, monkeypatch):
    asked = []
    pages = {
        "/domains": {
            "domains": [{"fqdn": "a.example"}, {"fqdn": "b.example"}],
            "meta": {"total": 3},
        },
        "/domains?offset=2": {"domains": [{"fqdn": "c.example"}], "meta": {"total": 3}},
    }

    def api(token, method, path, body=None):
        asked.append(path)
        return pages[path]

    monkeypatch.setattr(deploy, "timeweb_call", api)
    assert deploy.timeweb_zones("tw-token") == ["a.example", "b.example", "c.example"]
    assert asked == ["/domains", "/domains?offset=2"]
    assert all("limit" not in path for path in asked)  # the API's own page size is used

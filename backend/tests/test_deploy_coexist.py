import importlib.util
import sys
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "deploy.py"


@pytest.fixture(scope="module")
def deploy():
    spec = importlib.util.spec_from_file_location("deploy_coexist", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


# What `ss -ltnpH` prints on a server where another project already runs.
OTHER_PROJECT = """\
LISTEN 0 511  0.0.0.0:80      0.0.0.0:*  users:(("nginx",pid=700,fd=6),("nginx",pid=701,fd=6))
LISTEN 0 511     [::]:80         [::]:*  users:(("nginx",pid=700,fd=7))
LISTEN 0 128  0.0.0.0:22      0.0.0.0:*  users:(("sshd",pid=600,fd=3))
LISTEN 0 4096 127.0.0.1:8000  0.0.0.0:*  users:(("node",pid=900,fd=19))
LISTEN 0 4096 0.0.0.0:5432    0.0.0.0:*  users:(("postgres",pid=800,fd=5))
"""
APACHE = 'LISTEN 0 511 0.0.0.0:80 0.0.0.0:* users:(("apache2",pid=500,fd=4))\n'


def probe(deploy, listeners="", **options):
    values = {
        "listeners": deploy.parse_listeners(listeners),
        "nginx_installed": False,
        "ufw_active": False,
        "previous": {},
        "own_pid": None,
        "has_service": False,
    }
    values.update(options)
    return deploy.Probe(**values)


def test_what_listens_on_the_server_is_read_from_ss(deploy):
    found = deploy.parse_listeners(OTHER_PROJECT)
    assert found[80] == ("nginx", 700) and found[22] == ("sshd", 600)
    assert found[8000] == ("node", 900) and found[5432] == ("postgres", 800)
    assert deploy.parse_listeners("") == {}
    assert deploy.parse_listeners("nonsense\nLISTEN 0") == {}


def test_the_probe_output_is_split_into_what_matters(deploy):
    text = (
        "##SS\n" + OTHER_PROJECT + "##NGINX\nyes\n##UFW\nStatus: active\n\nTo   Action\n"
        '##STATE\n{"app_port": 8001, "public_port": 8080}\n##PID\n4242\n##UNIT\nyes\n'
    )
    result = deploy.parse_probe(text)
    assert result.nginx_installed and result.ufw_active and result.has_service
    assert result.previous == {"app_port": 8001, "public_port": 8080} and result.own_pid == 4242
    assert 80 in result.listeners
    empty = deploy.parse_probe("##SS\n##NGINX\nno\n##UFW\nStatus: inactive\n##STATE\n##PID\n0\n")
    assert not empty.nginx_installed and not empty.ufw_active and empty.own_pid is None
    assert deploy.parse_probe("##STATE\nnot json\n").previous == {}


def test_a_free_server_gets_the_app_on_port_80(deploy):
    plan = deploy.plan_ports(probe(deploy), None)
    assert (plan.app_port, plan.public_port) == (8000, 80)
    assert plan.install_nginx and plan.default_server and plan.domain is None


def test_another_projects_ports_are_never_taken(deploy):
    plan = deploy.plan_ports(probe(deploy, OTHER_PROJECT, nginx_installed=True), None)
    assert plan.app_port == 8001  # 8000 belongs to the other project
    assert plan.public_port == 8080  # and so does port 80, with its own sites
    assert not plan.install_nginx and not plan.default_server
    assert plan.notes and "8080" in plan.notes[0]


def test_a_program_that_is_not_nginx_on_port_80_is_left_alone(deploy):
    plan = deploy.plan_ports(probe(deploy, APACHE), None)
    assert plan.public_port == 8080 and plan.install_nginx and not plan.default_server
    assert "apache2" in plan.notes[0]


def test_a_domain_shares_port_80_by_name_with_the_other_sites(deploy):
    server = probe(deploy, OTHER_PROJECT, nginx_installed=True)
    plan = deploy.plan_ports(server, "school.example.com")
    assert plan.public_port == 80 and plan.domain == "school.example.com"
    assert not plan.default_server and not plan.install_nginx  # the other sites keep the default
    assert plan.ports_to_open == [80, 443]


def test_a_domain_is_dropped_when_port_80_belongs_to_something_else(deploy):
    plan = deploy.plan_ports(probe(deploy, APACHE), "school.example.com")
    assert plan.domain is None and plan.public_port == 8080
    assert "apache2" in plan.notes[0] and "домен" in plan.notes[0]


def test_a_re_run_keeps_its_ports_and_does_not_fight_itself(deploy):
    listening = (
        'LISTEN 0 4096 127.0.0.1:8001 0.0.0.0:* users:(("python",pid=4242,fd=3))\n'
        'LISTEN 0 511 0.0.0.0:8080 0.0.0.0:* users:(("nginx",pid=700,fd=6))\n'
    )
    again = probe(
        deploy,
        listening,
        nginx_installed=True,
        own_pid=4242,
        previous={"app_port": 8001, "public_port": 8080, "default_server": False},
    )
    plan = deploy.plan_ports(again, None)
    assert (plan.app_port, plan.public_port) == (8001, 8080) and not plan.install_nginx


def test_the_site_never_claims_to_be_the_default_unless_it_is_alone(deploy):
    on_port = deploy.render_nginx(None, app_port=8001, public_port=8080)
    assert "listen 8080;" in on_port and "default_server" not in on_port
    assert "proxy_pass http://127.0.0.1:8001;" in on_port
    alone = deploy.render_nginx(None, public_port=80, default_server=True)
    assert "listen 80 default_server;" in alone
    assert "default_server" not in deploy.render_nginx("school.example.com")
    assert "--port 8001" in deploy.render_unit(8001)


class Recorder:
    """Stands in for the server and remembers what it was told to do."""

    def __init__(self, replies=None):
        self.commands, self.written, self.replies = [], {}, replies or {}
        self.cfg = type("Cfg", (), {"app_port": 8000})()

    def run(self, command, check=True, timeout=900):
        self.commands.append(command)
        out = next((reply for key, reply in self.replies.items() if key in command), "")
        return type("Result", (), {"code": 0, "out": out, "err": ""})()

    def script(self, *lines, check=True, timeout=900):
        return self.run("\n".join(lines), check=check, timeout=timeout)

    def write(self, path, content, mode="644", owner="root:root"):
        self.written[path] = content


class Notes:
    def __init__(self):
        self.lines = []

    def note(self, text):
        self.lines.append(text)


def test_a_firewall_that_is_off_is_left_off(deploy):
    server, step = Recorder(), Notes()
    plan = deploy.Plan(8000, 8080, False, False, None, [])
    assert deploy.open_ports(server, probe(deploy, ufw_active=False), plan, step) == []
    assert server.commands == []  # not a single firewall command
    assert any("не включён" in line for line in step.lines)


def test_an_active_firewall_gets_only_the_missing_ports(deploy):
    server, step = Recorder({"ufw allow 8080": "Rule added\nRule added (v6)"}), Notes()
    plan = deploy.Plan(8000, 8080, False, False, None, [])
    added = deploy.open_ports(server, probe(deploy, ufw_active=True), plan, step)
    assert added == ["8080/tcp"]
    assert server.commands == ["LC_ALL=C ufw allow 8080/tcp comment probnik"]
    assert all("enable" not in command and "delete" not in command for command in server.commands)
    # a rule the other project already had is neither duplicated nor ever taken back
    existing = Recorder({"ufw allow 80": "Skipping adding existing rule"})
    shared = deploy.Plan(8000, 80, False, False, "school.example.com", [])
    assert deploy.open_ports(existing, probe(deploy, ufw_active=True), shared, Notes()) == []


def test_a_fresh_nginx_cannot_start_before_it_is_configured(deploy):
    fresh, reuse = Recorder(), Recorder()
    deploy.setup_vps(fresh, deploy.Plan(8000, 8080, True, False, None, []))
    deploy.setup_vps(reuse, deploy.Plan(8000, 8080, False, False, None, []))
    script = fresh.commands[0]
    assert "policy-rc.d" in script and "install -y nginx" in script
    assert script.index("policy-rc.d") < script.index("install -y nginx")
    assert "rm -f /etc/nginx/sites-enabled/default" in script  # only a nginx installed just now
    assert "install -y nginx" not in reuse.commands[0]
    assert "sites-enabled/default" not in reuse.commands[0]  # another project's nginx is untouched
    assert "ufw" not in script and "ufw" not in reuse.commands[0]


def test_a_site_that_nginx_refuses_is_taken_back_at_once(deploy):
    server = Recorder()
    deploy.configure_nginx(server, deploy.Plan(8001, 8080, False, False, None, []))
    script = server.commands[0]
    assert "nginx -t" in script and "rm -f /etc/nginx/sites-enabled/probnik" in script
    assert "systemctl reload nginx" in script and "systemctl stop nginx" not in script
    assert "listen 8080;" in server.written["/etc/nginx/sites-available/probnik"]


STATE = {"app_port": 8001, "public_port": 8080, "ufw_added": ["8080/tcp"], "domain": None}


def test_switching_off_touches_only_our_own_things(deploy):
    lines = "\n".join(deploy.stop_lines(STATE, probe(deploy, ufw_active=True)))
    assert "systemctl stop probnik" in lines and "systemctl disable probnik" in lines
    assert "rm -f /etc/nginx/sites-enabled/probnik" in lines
    assert "ufw delete allow 8080/tcp" in lines  # only the rule we added
    for forbidden in ("systemctl stop nginx", "ufw disable", "ufw reset", "apt", "rm -rf"):
        assert forbidden not in lines
    quiet = "\n".join(deploy.stop_lines(STATE, probe(deploy, ufw_active=False)))
    assert "ufw" not in quiet  # a firewall that is off is not touched


def test_switching_on_brings_back_the_site_and_the_rules(deploy):
    lines = "\n".join(deploy.start_lines(STATE, probe(deploy, ufw_active=True)))
    assert "systemctl enable --now probnik" in lines
    assert "ufw allow 8080/tcp" in lines and "ln -sf /etc/nginx/sites-available/probnik" in lines
    assert "nginx -t" in lines


def test_removing_keeps_the_data_unless_told_otherwise(deploy):
    text = "\n".join(deploy.remove_lines(STATE, probe(deploy), delete_data=False))
    move = text.index("mv /opt/probnik/backend/data /var/backups/probnik-data-")
    assert move < text.index("rm -rf /opt/probnik")  # the data is moved out before the folder goes
    assert "rm -f /etc/probnik.env" in text and "userdel probnik" in text
    erased = "\n".join(deploy.remove_lines(STATE, probe(deploy), delete_data=True))
    assert "/var/backups" not in erased and "rm -rf /opt/probnik" in erased
    for lines in (text, erased):
        assert "systemctl stop nginx" not in lines and "apt" not in lines
        assert "ufw disable" not in lines
    secure = {**STATE, "https": True, "domain": "school.example.com"}
    removal = "\n".join(deploy.remove_lines(secure, probe(deploy), delete_data=False))
    assert "certbot delete --cert-name school.example.com" in removal


def test_an_older_install_without_a_record_can_still_be_switched_off(deploy):
    state = deploy.current_deployment(probe(deploy, has_service=True))
    assert state["legacy"] and state["ufw_added"] == []  # no firewall rule is guessed
    assert deploy.current_deployment(probe(deploy, previous=STATE)) == STATE
    with pytest.raises(deploy.DeployError, match="не найдено"):
        deploy.current_deployment(probe(deploy))


ARGS = ["--dry-run", "--yes", "--host", "203.0.113.10"]


def run(deploy, monkeypatch, capsys, extra):
    monkeypatch.setenv("DEPLOY_PASSWORD", "secret-pass")
    monkeypatch.setattr(deploy, "STATE_FILE", Path("does-not-exist/.deploy.json"))
    code = deploy.main(ARGS + extra)
    return code, capsys.readouterr().out


def test_stop_start_and_uninstall_run_as_three_short_steps(deploy, monkeypatch, capsys):
    code, out = run(deploy, monkeypatch, capsys, ["--stop"])
    assert code == 0 and "[3/3]" in out and "Приложение выключено" in out
    assert "systemctl stop probnik" in out and "uv run scripts/deploy.py --start" in out
    assert "apt-get" not in out  # switching off installs nothing
    for change in ("ufw allow", "ufw delete", "ufw enable", "ufw disable"):
        assert change not in out  # reading the firewall status is fine, changing it is not
    code, out = run(deploy, monkeypatch, capsys, ["--start"])
    assert code == 0 and "systemctl enable --now probnik" in out and "снова включено" in out
    code, out = run(deploy, monkeypatch, capsys, ["--uninstall"])
    assert code == 0 and "mv /opt/probnik/backend/data /var/backups/probnik-data-" in out
    assert "сохранены в /var/backups" in out and "nginx, uv и другие программы" in out
    code, out = run(deploy, monkeypatch, capsys, ["--uninstall", "--delete-data"])
    assert code == 0 and "/var/backups/probnik-data" not in out and "удалены" in out


def test_the_deploy_dry_run_explains_what_it_found_and_leaves_the_firewall_alone(
    deploy, monkeypatch, capsys
):
    code, out = run(deploy, monkeypatch, capsys, [])
    assert code == 0 and "Смотрю, что уже работает на сервере" in out
    assert "файрвол ufw не включён" in out and "ufw --force enable" not in out
    assert "внутренний порт 8000, снаружи порт 80" in out
    assert "Выключить: uv run scripts/deploy.py --stop" in out


def test_removal_asks_for_a_confirmation_unless_told_not_to(deploy, monkeypatch):
    monkeypatch.setenv("DEPLOY_PASSWORD", "secret-pass")
    monkeypatch.setattr(deploy, "STATE_FILE", Path("does-not-exist/.deploy.json"))
    cfg = deploy.collect(deploy.parse_args(["--host", "203.0.113.10", "--uninstall", "--dry-run"]))
    cfg.dry_run = False  # the confirmation is skipped in a dry run, so ask for the real thing
    cfg.yes = False
    monkeypatch.setattr("builtins.input", lambda prompt="": "нет")
    with pytest.raises(deploy.DeployError, match="отменено"):
        deploy.confirm_removal(cfg)
    monkeypatch.setattr("builtins.input", lambda prompt="": "удалить")
    deploy.confirm_removal(cfg)  # the word is enough, in any case

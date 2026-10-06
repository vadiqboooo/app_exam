import argparse
from pathlib import Path

from app.config import ROOT, Settings
from app.database import make_engine
from app.services.backup import backup_database


def main():
    parser = argparse.ArgumentParser(description="Управление базой Пробник")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("init-db", help="Применить миграции базы")
    backup = commands.add_parser("backup", help="Создать резервную копию SQLite")
    backup.add_argument("destination", type=Path)
    drive = commands.add_parser(
        "drive-auth", help="Один раз войти в Google и получить токен для копий в Google Drive"
    )
    drive.add_argument(
        "client_secret", type=Path, help="JSON OAuth-клиента (тип «Приложение для ПК»)"
    )
    drive.add_argument(
        "--port",
        type=int,
        default=0,
        help="Порт входа; для клиента типа Web укажите порт из адреса http://localhost:ПОРТ/",
    )
    args = parser.parse_args()
    if args.command == "init-db":
        from alembic import command
        from alembic.config import Config

        command.upgrade(Config(str(ROOT / "alembic.ini")), "head")
    elif args.command == "drive-auth":
        from app.services.drive_auth import authorize

        print(authorize(args.client_secret, args.port))
    else:
        engine = make_engine(Settings().database_url)
        try:
            print(backup_database(engine, args.destination))
        finally:
            engine.dispose()


if __name__ == "__main__":
    main()

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
    args = parser.parse_args()
    if args.command == "init-db":
        from alembic import command
        from alembic.config import Config

        command.upgrade(Config(str(ROOT / "alembic.ini")), "head")
    else:
        engine = make_engine(Settings().database_url)
        try:
            print(backup_database(engine, args.destination))
        finally:
            engine.dispose()


if __name__ == "__main__":
    main()

import hashlib
import hmac
import re
import secrets
from dataclasses import dataclass
from datetime import timedelta

from app.time import utcnow

MAX_ATTEMPTS = 5
FIRST_LOCK = timedelta(minutes=5)
NEXT_LOCK = timedelta(minutes=30)
_ITERATIONS = 120_000
_CODE = re.compile(r"\d{6}")


def valid_code(code: str) -> bool:
    return _CODE.fullmatch(code) is not None


def hash_code(code: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", code.encode(), salt, _ITERATIONS)
    return f"pbkdf2${_ITERATIONS}${salt.hex()}${digest.hex()}"


def check_code(code: str, stored: str) -> bool:
    try:
        _, iterations, salt, digest = stored.split("$")
        actual = hashlib.pbkdf2_hmac("sha256", code.encode(), bytes.fromhex(salt), int(iterations))
    except ValueError:
        return False
    return hmac.compare_digest(actual.hex(), digest)


@dataclass
class Rejected:
    status: int
    detail: str


def lock_message(account) -> str | None:
    if account.locked_until is None or account.locked_until <= utcnow():
        return None
    seconds = (account.locked_until - utcnow()).total_seconds()
    minutes = max(1, int(seconds // 60) + (1 if seconds % 60 else 0))
    return f"Вход приостановлен из-за неверных попыток. Попробуйте через {minutes} мин."


def authenticate(account, code: str | None) -> Rejected | str:
    """Проверить код и обновить счётчики: 'ok', 'code_new' или 'code_required'."""
    locked = lock_message(account)
    if locked:
        return Rejected(429, locked)
    if account.access_code_hash is None:
        if code is None:
            return "code_new"
        if not valid_code(code):
            return Rejected(422, "Код состоит из 6 цифр")
        account.access_code_hash = hash_code(code)
    else:
        if code is None:
            return "code_required"
        if not valid_code(code) or not check_code(code, account.access_code_hash):
            account.failed_attempts += 1
            if account.failed_attempts >= MAX_ATTEMPTS:
                account.failed_attempts = 0
                account.lock_level += 1
                account.locked_until = utcnow() + (
                    FIRST_LOCK if account.lock_level == 1 else NEXT_LOCK
                )
                return Rejected(429, lock_message(account) or "Вход приостановлен")
            left = MAX_ATTEMPTS - account.failed_attempts
            return Rejected(401, f"Неверный код. Осталось попыток: {left}")
    account.failed_attempts = 0
    account.lock_level = 0
    account.locked_until = None
    account.last_login_at = utcnow()
    return "ok"


def unlock(account) -> None:
    account.failed_attempts = 0
    account.lock_level = 0
    account.locked_until = None


def reset_code(account) -> None:
    account.access_code_hash = None
    unlock(account)

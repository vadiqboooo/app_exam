import hashlib
import hmac
import time


def issue_token(entity_id: int, secret: str, kind: str = "student") -> str:
    payload = f"{kind}.{entity_id}.{int(time.time()) + 8 * 3600}"
    signature = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}.{signature}"


def read_token(token: str, secret: str, kind: str = "student") -> int:
    try:
        token_kind, entity_id, expires, signature = token.split(".")
        payload = f"{token_kind}.{entity_id}.{expires}"
        expected = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
        if (
            not secret
            or token_kind != kind
            or int(expires) <= time.time()
            or not hmac.compare_digest(expected, signature)
        ):
            raise ValueError("Недействительный сеанс")
        return int(entity_id)
    except (ValueError, TypeError) as error:
        raise ValueError("Сеанс истёк. Войдите снова") from error

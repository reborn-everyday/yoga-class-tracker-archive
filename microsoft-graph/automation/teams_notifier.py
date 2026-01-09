"""Post reminders to a Microsoft Teams channel using Microsoft Graph."""
from __future__ import annotations

import json
import os
import sys
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict
from zoneinfo import ZoneInfo

import requests

GRAPH_SCOPE = "https://graph.microsoft.com/.default"
TOKEN_URL_TEMPLATE = "https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
MESSAGE_URL_TEMPLATE = (
    "https://graph.microsoft.com/v1.0/teams/{team_id}/channels/{channel_id}/messages"
)


class ConfigurationError(Exception):
    """Raised when required configuration is missing."""


@dataclass
class TeamsConfig:
    team_id: str
    channel_id: str
    timezone: str
    message_text: str
    auth_mode: str
    tenant_id: str | None
    client_id: str | None
    client_secret: str | None
    refresh_token: str | None
    redirect_uri: str | None

    @classmethod
    def from_env(cls) -> "TeamsConfig":
        auth_mode = os.getenv("MS_TEAMS_AUTH_MODE", "client_credentials").strip()
        team_id = _require_env("MS_TEAMS_TEAM_ID")
        channel_id = _require_env("MS_TEAMS_CHANNEL_ID")
        message_text = os.getenv(
            "MS_TEAMS_MESSAGE_TEXT",
            "좋은 아침이에요! 예약된 Teams 알림입니다.",
        )
        timezone = os.getenv("MS_TEAMS_TIMEZONE", "Asia/Seoul")

        tenant_id = os.getenv("MS_TENANT_ID")
        client_id = os.getenv("MS_CLIENT_ID")
        client_secret = os.getenv("MS_CLIENT_SECRET")
        refresh_token = os.getenv("MS_GRAPH_REFRESH_TOKEN")
        redirect_uri = os.getenv("MS_GRAPH_REDIRECT_URI")

        cls._validate_auth(auth_mode, tenant_id, client_id, client_secret, refresh_token)

        return cls(
            team_id=team_id,
            channel_id=channel_id,
            timezone=timezone,
            message_text=message_text,
            auth_mode=auth_mode,
            tenant_id=tenant_id,
            client_id=client_id,
            client_secret=client_secret,
            refresh_token=refresh_token,
            redirect_uri=redirect_uri,
        )

    @staticmethod
    def _validate_auth(
        auth_mode: str,
        tenant_id: str | None,
        client_id: str | None,
        client_secret: str | None,
        refresh_token: str | None,
    ) -> None:
        if auth_mode not in {"client_credentials", "refresh_token"}:
            raise ConfigurationError(
                "MS_TEAMS_AUTH_MODE must be either 'client_credentials' or 'refresh_token'."
            )

        if not tenant_id or not client_id:
            raise ConfigurationError("MS_TENANT_ID and MS_CLIENT_ID must be set.")

        if auth_mode == "client_credentials" and not client_secret:
            raise ConfigurationError("MS_CLIENT_SECRET is required for client credentials.")

        if auth_mode == "refresh_token" and not refresh_token:
            raise ConfigurationError("MS_GRAPH_REFRESH_TOKEN is required for delegated auth.")


class TeamsNotifier:
    def __init__(self, config: TeamsConfig):
        self.config = config
        self.timezone = _get_timezone(config.timezone)

    def run(self) -> None:
        access_token = self._obtain_access_token()
        message_url = MESSAGE_URL_TEMPLATE.format(
            team_id=self.config.team_id,
            channel_id=self.config.channel_id,
        )
        payload = {"body": {"content": self.config.message_text}}

        response = requests.post(
            message_url,
            headers={"Authorization": f"Bearer {access_token}"},
            json=payload,
            timeout=30,
        )
        if response.status_code >= 400:
            raise RuntimeError(
                f"Failed to send message ({response.status_code}): {response.text}"
            )

        local_time = datetime.now(self.timezone).isoformat()
        print(f"Message sent at {local_time} to channel {self.config.channel_id}.")

    def _obtain_access_token(self) -> str:
        token_url = TOKEN_URL_TEMPLATE.format(tenant_id=self.config.tenant_id)
        if self.config.auth_mode == "client_credentials":
            data = {
                "client_id": self.config.client_id,
                "client_secret": self.config.client_secret,
                "grant_type": "client_credentials",
                "scope": GRAPH_SCOPE,
            }
        else:
            data = {
                "client_id": self.config.client_id,
                "client_secret": self.config.client_secret,
                "grant_type": "refresh_token",
                "refresh_token": self.config.refresh_token,
                "scope": GRAPH_SCOPE,
            }
            if self.config.redirect_uri:
                data["redirect_uri"] = self.config.redirect_uri

        response = requests.post(token_url, data=data, timeout=30)
        if response.status_code >= 400:
            raise RuntimeError(
                f"Failed to obtain access token ({response.status_code}): {response.text}"
            )

        token_body: Dict[str, Any] = response.json()
        access_token = token_body.get("access_token")
        if not access_token:
            raise RuntimeError(f"Token response missing access_token: {json.dumps(token_body)}")
        return access_token


def _require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise ConfigurationError(f"Environment variable {name} is required.")
    return value


def _get_timezone(name: str) -> ZoneInfo:
    try:
        return ZoneInfo(name)
    except Exception as exc:  # noqa: BLE001 - broad to catch invalid tz names
        raise ConfigurationError(f"Invalid timezone '{name}'.") from exc


def main() -> None:
    try:
        config = TeamsConfig.from_env()
        TeamsNotifier(config).run()
    except ConfigurationError as exc:
        print(f"Configuration error: {exc}", file=sys.stderr)
        sys.exit(1)
    except Exception as exc:  # noqa: BLE001 - top-level guard for runtime failures
        print(f"Failed to send Teams message: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()

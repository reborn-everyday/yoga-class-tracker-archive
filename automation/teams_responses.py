"""Helpers for working with Teams message reactions via Microsoft Graph.

The main entry point is :class:`TeamsReactionsClient`, which can retrieve the
display names of users who reacted with a "like" (thumbs-up) to a Teams
message. Pagination, transient API failures, and name lookups are handled
internally.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Dict, Iterable, List, Optional, Sequence, Set

try:
    import requests
    from requests.adapters import HTTPAdapter
except ImportError as exc:  # pragma: no cover - exercised in environments without requests
    raise ImportError(
        "The 'requests' package is required. Install dependencies from requirements.txt."
    ) from exc

from urllib3.util.retry import Retry


DEFAULT_BASE_URL = "https://graph.microsoft.com/v1.0"


def _default_logger() -> logging.Logger:
    logger = logging.getLogger(__name__)
    if not logger.handlers:
        handler = logging.StreamHandler()
        formatter = logging.Formatter(
            "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
        )
        handler.setFormatter(formatter)
        logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    return logger


@dataclass
class TeamsReactionsClient:
    """Client for fetching Teams reactions and resolving user names.

    Parameters
    ----------
    access_token:
        OAuth access token with permissions to call the Microsoft Graph
        reactions API and read user profiles.
    base_url:
        Base URL for the Graph endpoint. Defaults to the v1.0 API.
    session:
        Optional ``requests.Session`` to reuse connections. When omitted, a
        session with retry support is created automatically.
    logger:
        Logger used for diagnostic output. A default logger writing to stdout is
        created when omitted.
    max_retries:
        Maximum number of retries for transient failures.
    backoff_factor:
        Factor for exponential backoff between retries.
    request_timeout:
        Timeout (seconds) for each HTTP request.
    """

    access_token: str
    base_url: str = DEFAULT_BASE_URL
    session: Optional[requests.Session] = None
    logger: logging.Logger = field(default_factory=_default_logger)
    max_retries: int = 3
    backoff_factor: float = 0.5
    request_timeout: int = 10

    def __post_init__(self) -> None:
        self.base_url = self.base_url.rstrip("/")
        if self.session is None:
            self.session = self._build_session()
        self.session.headers.update(
            {
                "Authorization": f"Bearer {self.access_token}",
                "Accept": "application/json",
            }
        )
        self.logger.debug("TeamsReactionsClient initialized with base_url=%s", self.base_url)

    def list_like_reactors(self, message_resource: str) -> List[str]:
        """Return display names of users who reacted with a like/thumbs-up.

        The ``message_resource`` should be the path to the message relative to
        the Graph base URL, for example
        ``teams/{team-id}/channels/{channel-id}/messages/{message-id}``.
        """

        reactions_url = self._build_reactions_url(message_resource)
        self.logger.info("Fetching reactions from %s", reactions_url)

        reactions = self._collect_reactions(reactions_url)
        liker_ids = self._extract_liker_ids(reactions)
        self.logger.info("Found %d unique users who liked the message", len(liker_ids))

        display_names: List[str] = []
        seen_names: Set[str] = set()
        for user_id in liker_ids:
            name = self._fetch_user_display_name(user_id)
            if name and name not in seen_names:
                display_names.append(name)
                seen_names.add(name)

        return display_names

    def _build_session(self) -> requests.Session:
        session = requests.Session()
        retry_strategy = Retry(
            total=self.max_retries,
            read=self.max_retries,
            connect=self.max_retries,
            backoff_factor=self.backoff_factor,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["HEAD", "GET", "OPTIONS"],
            respect_retry_after_header=True,
            raise_on_status=False,
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        session.mount("https://", adapter)
        session.mount("http://", adapter)
        return session

    def _build_reactions_url(self, message_resource: str) -> str:
        message_path = message_resource.strip("/")
        return f"{self.base_url}/{message_path}/reactions"

    def _collect_reactions(self, url: str) -> List[Dict]:
        reactions: List[Dict] = []
        next_url: Optional[str] = url

        while next_url:
            payload = self._get_json(next_url, context="reactions page")
            page_reactions = payload.get("value", []) if payload else []
            self.logger.debug("Received %d reactions", len(page_reactions))
            reactions.extend(page_reactions)
            next_url = payload.get("@odata.nextLink") if payload else None

        return reactions

    def _get_json(self, url: str, *, context: str) -> Dict:
        try:
            response = self.session.get(url, timeout=self.request_timeout)
        except requests.RequestException as exc:
            self.logger.warning("Request for %s failed: %s", context, exc)
            raise

        if 500 <= response.status_code < 600:
            self.logger.warning(
                "Transient error for %s (status %s): %s",
                context,
                response.status_code,
                response.text,
            )

        if not response.ok:
            self.logger.error(
                "Failed to fetch %s (status %s): %s",
                context,
                response.status_code,
                response.text,
            )
            response.raise_for_status()

        try:
            return response.json()
        except ValueError as exc:
            self.logger.error("Invalid JSON in %s response: %s", context, exc)
            raise

    def _extract_liker_ids(self, reactions: Iterable[Dict]) -> List[str]:
        liker_ids: List[str] = []
        seen: Set[str] = set()
        for reaction in reactions:
            reaction_type = (reaction.get("reactionType") or "").lower()
            if reaction_type not in {"like", "thumbsup", "thumbs_up"}:
                continue
            user_id = (
                reaction.get("user", {}) or reaction.get("createdBy", {})
            ).get("id")
            if user_id and user_id not in seen:
                seen.add(user_id)
                liker_ids.append(user_id)
        return liker_ids

    def _fetch_user_display_name(self, user_id: str) -> Optional[str]:
        url = f"{self.base_url}/users/{user_id}"
        self.logger.debug("Fetching display name for user %s", user_id)
        payload = self._get_json(url, context=f"user {user_id}")
        name = payload.get("displayName") if payload else None
        if not name:
            self.logger.warning("Display name missing for user %s", user_id)
        return name


def list_like_reactors(
    access_token: str,
    message_resource: str,
    *,
    base_url: str = DEFAULT_BASE_URL,
    logger: Optional[logging.Logger] = None,
    session: Optional[requests.Session] = None,
    max_retries: int = 3,
    backoff_factor: float = 0.5,
    request_timeout: int = 10,
) -> List[str]:
    """Convenience wrapper to fetch like/thumbs-up reactors for a message.

    Parameters mirror :class:`TeamsReactionsClient`. The ``message_resource``
    must be the Graph path to the message (e.g.
    ``teams/{team-id}/channels/{channel-id}/messages/{message-id}`` or
    ``chats/{chat-id}/messages/{message-id}``).
    """

    client = TeamsReactionsClient(
        access_token=access_token,
        base_url=base_url,
        session=session,
        logger=logger or _default_logger(),
        max_retries=max_retries,
        backoff_factor=backoff_factor,
        request_timeout=request_timeout,
    )
    return client.list_like_reactors(message_resource)

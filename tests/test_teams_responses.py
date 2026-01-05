import logging
from typing import List

import pytest

requests = pytest.importorskip("requests")

from automation.teams_responses import TeamsReactionsClient, list_like_reactors


class _FakeResponse:
    def __init__(self, status_code: int, payload: dict):
        self.status_code = status_code
        self._payload = payload

    @property
    def ok(self) -> bool:
        return 200 <= self.status_code < 300

    @property
    def text(self) -> str:
        return str(self._payload)

    def json(self) -> dict:
        return self._payload

    def raise_for_status(self) -> None:
        raise requests.HTTPError(f"status {self.status_code}")


class _FakeSession:
    def __init__(self, responses: List[_FakeResponse]):
        self._responses = responses
        self.requested_urls: List[str] = []
        self.headers = {}

    def get(self, url: str, timeout: int):
        self.requested_urls.append(url)
        if not self._responses:
            raise AssertionError("No more fake responses configured")
        return self._responses.pop(0)


def test_list_like_reactors_paginates_and_filters():
    reactions_url = "https://graph.microsoft.com/v1.0/chats/1/messages/abc/reactions"
    user1 = "user-1"
    user2 = "user-2"
    fake_responses = [
        _FakeResponse(
            200,
            {
                "value": [
                    {"reactionType": "like", "user": {"id": user1}},
                    {"reactionType": "THUMBS_UP", "createdBy": {"id": user2}},
                ],
                "@odata.nextLink": reactions_url + "?page=2",
            },
        ),
        _FakeResponse(200, {"value": [{"reactionType": "heart", "user": {"id": user1}}]}),
        _FakeResponse(200, {"displayName": "User One"}),
        _FakeResponse(200, {"displayName": "User Two"}),
    ]
    session = _FakeSession(fake_responses)
    client = TeamsReactionsClient(
        access_token="token",
        session=session,
        logger=logging.getLogger("tests.teams_reactions"),
    )

    names = client.list_like_reactors("chats/1/messages/abc")

    assert names == ["User One", "User Two"]
    assert reactions_url in session.requested_urls[0]


def test_list_like_reactors_raises_on_error():
    session = _FakeSession([_FakeResponse(500, {"error": "server error"})])
    client = TeamsReactionsClient(
        access_token="token",
        session=session,
        logger=logging.getLogger("tests.teams_reactions"),
        max_retries=0,
    )

    with pytest.raises(requests.HTTPError):
        client.list_like_reactors("chats/1/messages/error")


def test_convenience_wrapper_uses_client_defaults(monkeypatch):
    captured_access_token = {}

    def fake_init(self, access_token: str, **kwargs):
        captured_access_token["token"] = access_token
        kwargs["session"] = _FakeSession(
            [
                _FakeResponse(
                    200,
                    {
                        "value": [{"reactionType": "like", "user": {"id": "u1"}}],
                    },
                ),
                _FakeResponse(200, {"displayName": "Person"}),
            ]
        )
        kwargs["access_token"] = access_token
        original_init(self, **kwargs)

    original_init = TeamsReactionsClient.__init__
    monkeypatch.setattr(TeamsReactionsClient, "__init__", fake_init)

    names = list_like_reactors("token-123", "chats/1/messages/abc")

    assert names == ["Person"]
    assert captured_access_token["token"] == "token-123"

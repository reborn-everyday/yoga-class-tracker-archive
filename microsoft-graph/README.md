# yoga-class-tracker

A simple tool to book yoga classes and track attendance automatically.

## Microsoft Teams notifier

A lightweight notifier posts a reminder to a Teams channel at 8:00 AM KST on Monday, Tuesday, and Thursday.

### Configuration

Set the following environment variables (locally or as repository/environment secrets and variables for GitHub Actions):

- `MS_TEAMS_AUTH_MODE`: `client_credentials` (default) or `refresh_token`.
- `MS_TENANT_ID`: Azure AD tenant ID.
- `MS_CLIENT_ID`: App (client) ID.
- `MS_CLIENT_SECRET`: Client secret (required for client credentials; used with refresh tokens if configured).
- `MS_GRAPH_REFRESH_TOKEN`: Delegated refresh token (required when `MS_TEAMS_AUTH_MODE=refresh_token`).
- `MS_GRAPH_REDIRECT_URI`: Redirect URI associated with the refresh token (optional but recommended for delegated flows).
- `MS_TEAMS_TEAM_ID`: Target Teams team ID.
- `MS_TEAMS_CHANNEL_ID`: Target channel ID.
- `MS_TEAMS_MESSAGE_TEXT`: Custom message body (defaults to a Korean morning reminder).
- `MS_TEAMS_TIMEZONE`: IANA timezone (for logging and validation). Defaults to `Asia/Seoul`.

Install the runtime dependency locally:

```bash
pip install -r automation/requirements.txt
```

Run the notifier manually to verify credentials:

```bash
MS_TEAMS_TEAM_ID=... MS_TEAMS_CHANNEL_ID=... MS_TENANT_ID=... \
MS_CLIENT_ID=... MS_CLIENT_SECRET=... \
python automation/teams_notifier.py
```

### Scheduling

A GitHub Actions workflow in `.github/workflows/teams-notifier.yml` runs the notifier at `08:00` KST every Monday, Tuesday, and Thursday and also supports manual dispatch. The cron expression is already adjusted to UTC for that schedule; if you need a different local timezone, convert to the equivalent UTC time and set `MS_TEAMS_TIMEZONE` for clear logging.

Example local cron entry (runs at 08:00 in the host timezone):

```
0 8 * * 1,2,4 /usr/bin/env -S bash -lc 'cd /path/to/yoga-class-tracker && source venv/bin/activate && python automation/teams_notifier.py'
```

### Azure AD app provisioning

1. Register an app in Azure AD (Entra ID) and note the **Application (client) ID** and **Directory (tenant) ID**.
2. Add Microsoft Graph **Application permissions**: `ChatMessage.Send` and `ChannelMessage.Send` (and grant admin consent). For delegated flows, add the same as delegated permissions and capture a refresh token via your OAuth consent flow.
3. Create a **client secret** (or certificate) and store it securely.
4. Record the target **Team ID** and **Channel ID** from Teams (e.g., via Graph Explorer or Teams UI).

### Secret storage guidance

- For GitHub Actions, store sensitive values (`MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_GRAPH_REFRESH_TOKEN`) in repository or environment **Secrets**, and non-sensitive configuration (team/channel IDs, message text, timezone) in **Variables**.
- For on-prem or server deployments, inject these as environment variables (e.g., via a process manager). If using Azure, prefer **Azure Key Vault** or your secret manager of choice and load them into the environment before running the script.

### Files of interest

- `automation/teams_notifier.py`: Authenticates with Microsoft Graph and posts the scheduled message.
- `.github/workflows/teams-notifier.yml`: Scheduler invoking the notifier at the configured times.

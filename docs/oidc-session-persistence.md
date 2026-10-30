# OIDC sessions across desktop restarts

The desktop app now retains Chromium's persistent cookie store and flushes cookie
changes during use and before server teardown on exit. Previously every launch
deleted the cookie store and restored `session-cookies.json`, written during
shutdown. A missing, stale or skipped snapshot could discard a valid login.
The old backup is imported once, preserving expiry and host-only cookies without
overwriting current cookies, and then deleted. Cookie reset remains available on
the login page.

The PHP backend stores OIDC access and refresh tokens in its server-side session.
The desktop cookie identifies that session; losing it also loses access to the
refresh token. `OidcClient::tryRefreshSession()` already refreshes tokens near
expiry, retains refresh tokens when the provider does not rotate them, and checks
the returned identity and group permissions.

Two separate limits still apply:

- `oidc.php` sets an absolute eight-hour session deadline. Refreshing an access
  token does not extend this deadline. Changing it is a separate session policy
  decision; this restart fix preserves it.
- Refresh tokens are optional. Configure the provider/client to issue them. Some
  providers require the `offline_access` scope and consent; add that scope to the
  tenant provider configuration (or global `OIDC['scopes']` for administrator
  login) only when supported. A new sign-in is needed to obtain newly enabled
  tokens. The server's PHP session storage must also retain the session data.

## Findings from the local SimpleSAMLphp IdP

Inspected `../Idp` on 2026-09-14. These are local source/configuration findings;
the deployed configuration and database client registrations were not queried.

- `config/module_oidc.php:59-61` configures authorization codes for ten minutes,
  access tokens for one hour, and refresh tokens for one calendar month (`P1M`).
- `modules/oidc/src/Server/Grants/AuthCodeGrant.php:556` issues a refresh token
  only when the granted scopes include `offline_access`.
- `ScopeOfflineAccessRule` rejects that scope unless it is registered for the
  requesting client. Client registrations are stored in the IdP database.
- Presenter's local global/admin `config.php` requests `openid email profile
groups`, without `offline_access`. Tenant login uses the `oidc_providers`
  database row instead; its effective scopes still need verification.
- IdP `config/config.php:149-164` sets eight-hour SSO sessions, a browser-session
  cookie (`session.cookie.lifetime = 0`), and disables remember-me. Refresh-token
  validation uses the token/client/revocation records, independently of this
  browser SSO cookie.
- Refresh grants and UserInfo read the OIDC user repository; they do not rerun
  the ChurchTools password login or fetch current ChurchTools memberships. The
  claims reflect the stored IdP user record. Extending Presenter sessions must
  account for this delay in picking up disabled users or changed groups.

To enable renewal for this IdP, allow `offline_access` on the specific Presenter
client in the IdP administration and request it in the matching Presenter tenant
provider settings (or global scopes for administrator login), preserving the
existing scopes. Arrange the offline-access consent required by OIDC and sign in
again to obtain a refresh token. Adding the scope only on the Presenter side can
cause an authorization error if the registered client does not allow it.
This enables access-token renewal within Presenter's existing eight-hour limit;
it does not change that limit or refresh ChurchTools account data.

References: [Electron cookie persistence](https://www.electronjs.org/docs/latest/api/cookies#cookiesflushstore),
[OIDC offline access](https://openid.net/specs/openid-connect-core-1_0-errata2.html#OfflineAccess).

Run `node test/session-cookies/run.mjs` for isolated persistence regressions.
Add `--electron` to also test actual cookie persistence across four Electron
processes using a temporary profile, without windows or network requests.
For deployment verification, sign in, close and reopen the desktop app immediately,
then repeat after access-token expiry but before the eight-hour deadline. Verify
that explicit logout remains logged out after restart. This requires a running
backend and configured identity provider; the isolated tests do not contact either.

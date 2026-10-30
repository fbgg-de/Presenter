# OIDC client corrections

Deploy `oidc.php`, `classes/OidcClient.php`, and `classes/OidcProtocol.php` together. Tenant-specific providers and the separate global administrator flow are preserved. Existing name-based ChurchTools group permissions remain in use.

The shared protocol implementation verifies RS256 signatures, issuer, audience/authorized party, required time claims, nonce, and UserInfo subject. Authorization uses S256 PKCE and a single-use ten-minute transaction. Login rotates the session; return URLs remain on the application origin. Provider errors lead to a generic local error rather than another automatic login or a URL containing profile details.

Set optional `OIDC['issuer']` to the exact discovery issuer for global issuer pinning. Tenant providers continue to use their configured HTTPS discovery authority. This implementation supports RS256 and `client_secret_post`; verify other tenant providers before deployment if their settings differ.

Provider selection is rechecked against the selected account during the callback. Refreshed sessions require the same identity and current returned group claims. Expired tokens no longer retain access indefinitely after refresh failure. Existing OIDC sessions must sign in once after rollout, and sessions now have an eight-hour ceiling. IdP SSO attributes may remain cached until fresh IdP authentication; this is not immediate membership revocation.

The provider logout destination is fixed to the exact `BASE_URL + login`, without arbitrary query parameters. Keep that URL registered at the provider.

Remaining concern: the existing `Origin: null` CORS allowance supports the packaged Electron renderer but also trusts other opaque browser origins. Safely removing it requires a coordinated Electron/API origin change; it remains unchanged here. This work is not a full authorization/CORS audit of every API endpoint.

The identical protocol test is maintained in the sibling Infoloop project's `tests/oidc.php`; pass this project's `classes/OidcProtocol.php` as its first argument. Infoloop's `tests/reference-callbacks.cjs` exercises the actual callback and client facade with isolated provider/DB fixtures. Keep protocol copies synchronized.

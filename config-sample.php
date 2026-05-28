<?php

// Development mode flag - set to false in production
const DEVELOPMENT = true;

if (DEVELOPMENT) {
    ini_set('display_errors', '1');
    ini_set('display_startup_errors', '1');
    error_reporting(E_ALL);
}

const DOMAIN = 'localhost';
const BASE_URL = 'http://' . DOMAIN . '/';

// CORS: list of origins that may call the API.
// In development, include the Vite dev server and Electron's file:// origin ("null").
// In production, set this to your frontend's actual origin, e.g. 'https://presenter.example.com'.
const CORS_ALLOWED_ORIGINS = [
    'http://localhost:5173',  // Vite dev server
    'http://localhost:4173',  // Vite preview
    'null',                   // Electron packaged (file:// sends Origin: null)
];

const DEFAULT_LANGUAGE = 'de'; // Default language: 'en' (English) or 'de' (German)

// Database
const DB_HOST = 'localhost';
const DB_DATABASE = 'db';
const DB_USER = 'user';
const DB_PASSWORD = 'password';

const SEARCH_RESULT_LIMIT = 10;
const CUSTOM_NUMBER_LIMIT = 10000;

// OIDC Configuration (Admin)
const OIDC_DISCOVERY_URL = 'https://idp/.well-known/openid-configuration';
const OIDC_CLIENT_ID = 'client_id';
const OIDC_CLIENT_SECRET = 'client_secret';
const OIDC_ADMIN_GROUP = 'admin';
const OIDC_REQUIRED_GROUP = ''; // Optional: require user to be in this group (leave empty for no restriction)
const OIDC_REDIRECT_URI = BASE_URL . 'oidc';
const OIDC_CLIENT_SCOPES = ['openid', 'email', 'profile', 'groups'];

// WebSocket Relay Server
// Configure the standalone WebSocket server that clients (operator + musician) connect to.
// Set 'wss' => true when the server is behind a TLS-terminating reverse proxy.
// 'path' is optional (default: '/'). Use a sub-path (e.g. '/ws') when the WS server
// shares the same hostname as the PHP app and is routed by path in the reverse proxy.
// Leave host empty or remove this constant to disable WebSocket sync.
const WS_HOST = [
  // 'wss'  => true,
  // 'host' => 'presenter.example.com', // same host as the app — routed via /ws path
  // 'port' => 443,
  // 'path' => '/ws',
];

// Bible API Configuration
// Only JSON-based APIs are supported. The translation is user-selectable at runtime.
// See requirements.md §10.2 for details.
const BIBLE_API = [
  'enabled' => false,
  'name' => 'API.Bible',
  'base_url' => 'https://api.scripture.api.bible/v1',
  'api_key' => 'your-api-key-here',       // optional, leave empty if not required
  'translations_endpoint' => '/bibles',                  // endpoint path that returns available translations
  'translations_path' => 'data',                     // dot-notation path to extract the translations array from the response
  'translation_id_field' => 'id',                       // field name for the translation ID
  'translation_name_field' => 'name',                     // field name for the display name
  'translation_lang_field' => 'language.id',              // field name for the language code (for filtering)
  'verse_endpoint' => '/bibles/{translation}/search', // endpoint path for verse lookup ({translation} is replaced)
  'verse_path' => 'data.passages',            // dot-notation path to extract verse data from the response
  'verse_text_field' => 'content',                  // field name for verse text content
  'verse_ref_field' => 'reference',                // field name for verse reference
];

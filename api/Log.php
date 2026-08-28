<?php

require_once(__DIR__ . '/RestController.php');

class Log extends RestController
{
    private static string $filename = __DIR__ . '/../error.log';

    public static function write($message): bool
    {
        return file_put_contents(self::$filename, date('Y.m.d H:i:s - ') . $message . "\n", FILE_APPEND) !== false;
    }

    public static function read(): string
    {
        if (file_exists(self::$filename)) {
            return file_get_contents(self::$filename);
        }

        return '';
    }

    private static function parseLogLine(string $line): ?array
    {
        // Parse log format: [date] [severity] [file:line] [function] message
        if (preg_match('/^\[([\d\.\s:]+)\]\s+\[(\w+)\]\s+\[([^\]]+)\]\s+\[([^\]]+)\]\s+(.*)$/', $line, $matches)) {
            return [
                'timestamp' => $matches[1],
                'severity' => $matches[2],
                'location' => $matches[3],
                'function' => $matches[4],
                'message' => $matches[5]
            ];
        }
        return null;
    }

    protected function get(Request &$req, Response &$res): never
    {
        $this->requireAdmin($res);

        // Check if admin requesting structured data
        $format = $req->query->get('format', 'text', false);

        if ($format === 'json') {
            $offset = $req->query->getAsInt('offset', 0);
            $limit = $req->query->getAsInt('limit', 50);
            $severity = $req->query->get('severity', null, false);

            if (!file_exists(self::$filename)) {
                $res->success([
                    'total' => 0,
                    'offset' => $offset,
                    'limit' => $limit,
                    'logs' => []
                ]);
            }

            $lines = file(self::$filename, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
            if ($lines === false) {
                $res->error(500, 'failed to read log file');
            }

            // Reverse to show newest first
            $lines = array_reverse($lines);

            // Parse and filter logs
            $logs = [];
            foreach ($lines as $line) {
                $parsed = self::parseLogLine($line);
                if ($parsed === null) {
                    continue;
                }

                // Filter by severity if specified
                if ($severity !== null && $parsed['severity'] !== $severity) {
                    continue;
                }

                $logs[] = $parsed;
            }

            $total = count($logs);
            $logs = array_slice($logs, $offset, $limit);

            $res->success([
                'total' => $total,
                'offset' => $offset,
                'limit' => $limit,
                'logs' => $logs
            ]);
        } else {
            // Backwards compatibility: return plain text
            $res->type('text/plain')->end(self::read());
        }
    }

    /** One entry is one line, and long enough to flood the file if a loop reports forever. */
    private const MAX_CLIENT_MESSAGE = 4000;

    /**
     * Markers of browser-extension code, which mobile browsers inject into every page.
     *
     * Mirrors src/renderer/src/utils/errorNoise.ts, which drops these before they are ever sent.
     * Kept here as well because clients update on their own schedule: a phone running last
     * month's bundle would otherwise keep filling the log with faults from code that is not ours.
     */
    private const EXTENSION_MARKERS = [
        '__firefox__',
        '__gcrweb', // Chrome and Brave on iOS — the same class of injected bridge
        'darkreader',
        'window.ethereum',
        'ethereum.selectedaddress',
        'chrome-extension://',
        'moz-extension://',
        'safari-extension://',
        'safari-web-extension://',
    ];

    /** True for a report from injected third-party code rather than from the application. */
    private static function isThirdPartyNoise(string $message): bool
    {
        // strtolower, not mb_strtolower: every marker is ASCII, and this runs on each report —
        // no reason to require the mbstring extension for it.
        $haystack = strtolower($message);

        foreach (self::EXTENSION_MARKERS as $marker) {
            if (str_contains($haystack, $marker)) {
                return true;
            }
        }

        // A bare "Script error." is what a browser reports for a cross-origin script it will not
        // describe. Everything this app serves is same-origin, so one can only come from injected
        // code — and it carries no file, line or stack to act on regardless.
        //
        // By the time it reaches here the message is decorated at both ends: an
        // "[EARLY_ERROR] [where]" prefix from the early capture script, and a " | UA=…" tail from
        // either reporter. Both have to come off before the message itself can be recognised.
        $bare = preg_replace('/^\[early_error\]\s*(\[[^\]]*\]\s*)?/', '', $haystack) ?? $haystack;
        $bare = rtrim(trim(explode(' | ', $bare)[0]), '.');

        if ($bare === 'script error') {
            return true;
        }

        return false;
    }

    /**
     * Take an error report from the browser.
     *
     * Deliberately open to unauthenticated callers: a client that crashed hard enough to be
     * worth reporting is exactly the one whose session may be the thing that broke. The message
     * is capped and flattened instead, so an anonymous caller can waste a line but not the file.
     *
     * Written through the same bracketed format the rest of the app logs in — the JSON reader
     * behind the admin log view parses that shape and silently drops anything else, which is why
     * client errors used to reach the file and never appear in the view.
     */
    protected function post(Request &$req, Response &$res): never
    {
        $req->params->check('message');

        $message = (string)$req->params->get('message');
        $severity = strtoupper((string)$req->params->get('severity', 'ERROR', false));
        if (!in_array($severity, ['ERROR', 'WARNING', 'INFO'], true)) {
            $severity = 'ERROR';
        }

        // Answer 200 either way: the client is not at fault and must not retry, and a report
        // it should not have sent is simply not worth a line.
        if (self::isThirdPartyNoise($message)) {
            $res->success(['message' => 'ignored']);
        }

        // The reader is line-based, so a stack trace has to arrive as one line.
        $message = trim(preg_replace('/\s*\R+\s*/', ' | ', $message) ?? $message);
        if (mb_strlen($message) > self::MAX_CLIENT_MESSAGE) {
            $message = mb_substr($message, 0, self::MAX_CLIENT_MESSAGE) . ' …[truncated]';
        }

        // Where it came from, in the two slots the format keeps for a server-side location.
        $source = (string)$req->params->get('source', 'unknown', false);
        $source = preg_replace('/[^A-Za-z0-9_.:-]/', '', $source) ?: 'unknown';
        $page = (string)$req->params->get('page', '', false);
        $page = preg_replace('/[^A-Za-z0-9_\/.:?=&-]/', '', $page) ?: '-';

        self::writeEntry($message, $severity, 'client:' . $source, $page);

        $res->success();
    }

    /** The bracketed line the JSON reader below expects: [date] [level] [where] [what] message. */
    private static function writeEntry(string $message, string $severity, string $location, string $context): bool
    {
        $line = sprintf("[%s] [%s] [%s] [%s] %s
", date('Y.m.d H:i:s'), $severity, $location, $context, $message);

        return file_put_contents(self::$filename, $line, FILE_APPEND) !== false;
    }

    protected function delete(Request &$req, Response &$res): never
    {
        $this->requireAdmin($res);

        if (file_exists(self::$filename)) {
            unlink(self::$filename);
        }

        $res->success(['message' => 'log file cleared']);
    }
}

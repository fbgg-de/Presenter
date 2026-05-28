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

    protected function post(Request &$req, Response &$res): never
    {
        $req->params->check('message');

        $message = $req->params->get('message');
        self::write($message);

        $res->success();
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

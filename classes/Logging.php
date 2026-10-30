<?php

class Logging
{
    /** Resolved on first use, so config.php's LOG_DIR is defined by then. */
    private static ?string $filename = null;

    /**
     * Past this size error.log moves to error.1.log (replacing the previous one) and starts over.
     * Anyone can write to it — POST /rest/Log is open so blank-page errors still arrive — so
     * without a cap it could fill the disk, and the admin log view reads the file whole.
     * ponytail: two requests rotating at the same instant may drop a few lines; add flock if that matters.
     */
    public const MAX_BYTES = 5 * 1024 * 1024;

    /**
     * The log file: logs/error.log in the app folder, or error.log in config.php's LOG_DIR — best
     * outside the web root, where no web server rule is needed to keep it private.
     */
    public static function file(): string
    {
        if (self::$filename === null) {
            $dir = defined('LOG_DIR') && LOG_DIR !== '' ? rtrim(LOG_DIR, '/\\') : __DIR__ . '/../logs';
            self::$filename = $dir . '/error.log';
        }
        return self::$filename;
    }

    /** Where the previous log goes: error.log → error.1.log. */
    public static function rotatedFile(): string
    {
        return preg_replace('/(\.log)?$/', '.1$1', self::file(), 1);
    }

    /** Append one finished line, rotating first when the file is full. Every writer goes through here. */
    public static function append(string $line): bool
    {
        $file = self::file();
        $dir = dirname($file);
        if (!is_dir($dir)) {
            @mkdir($dir, 0775, true);
        }
        // The folder guards itself, like cache/: private even without the root .htaccess.
        if (!is_file($dir . '/.htaccess')) {
            @file_put_contents($dir . '/.htaccess', "Require all denied\n");
        }

        clearstatcache(true, $file);
        if (@filesize($file) > self::MAX_BYTES) {
            @rename($file, self::rotatedFile());
        }

        if (@file_put_contents($file, $line, FILE_APPEND) !== false) {
            return true;
        }
        // Folder not writable: hand the line to the web server's own error log rather than lose it.
        error_log(rtrim($line));
        return false;
    }

    /**
     * Write a log message with automatic context information (file, class, method, line)
     *
     * @param string $message The message to log
     * @param string $level Log level (INFO, WARNING, ERROR, DEBUG)
     * @param int $callerDepth Which caller depth to use for context (default: 1)
     * @return bool True if successful, false otherwise
     */
    public static function write(string $message, string $level = 'INFO', int $callerDepth = 1): bool
    {
        // Get backtrace to find caller information
        $trace = debug_backtrace(DEBUG_BACKTRACE_IGNORE_ARGS, $callerDepth + 1);
        $caller = $trace[$callerDepth] ?? $trace[count($trace) - 1];

        // Extract context information
        $file = isset($caller['file']) ? basename($caller['file']) : 'unknown';
        $line = $caller['line'] ?? 0;
        $class = $caller['class'] ?? '';
        $method = $caller['function'] ?? '';

        // Build context string
        $context = $class ? "{$class}::{$method}" : $method;
        if (!$context) {
            $context = 'global';
        }

        // Format: [2025.11.30 23:59:59] [INFO] [File.php:123] [ClassName::method] Message
        $logEntry = sprintf(
            "[%s] [%s] [%s:%d] [%s] %s\n",
            date('Y.m.d H:i:s'),
            strtoupper($level),
            $file,
            $line,
            $context,
            $message
        );

        return self::append($logEntry);
    }

    /**
     * Write an INFO level log message
     */
    public static function info(string $message, int $callerDepth = 1): bool
    {
        return self::write($message, 'INFO', $callerDepth + 1);
    }

    /**
     * Write a WARNING level log message
     */
    public static function warning(string $message, int $callerDepth = 1): bool
    {
        return self::write($message, 'WARNING', $callerDepth + 1);
    }

    /**
     * Write an ERROR level log message
     */
    public static function error(string $message, int $callerDepth = 1): bool
    {
        return self::write($message, 'ERROR', $callerDepth + 1);
    }

    /**
     * Write a DEBUG level log message
     */
    public static function debug(string $message, int $callerDepth = 1): bool
    {
        return self::write($message, 'DEBUG', $callerDepth + 1);
    }

    /**
     * Read all log contents
     */
    public static function read(): string
    {
        if (!file_exists(self::file())) {
            return '';
        }
        return file_get_contents(self::file());
    }

    /**
     * Clear all logs
     */
    public static function clear(): bool
    {
        return file_put_contents(self::file(), '') !== false;
    }

    /**
     * Get the last N lines from the log
     */
    public static function tail(int $lines = 100): string
    {
        if (!file_exists(self::file())) {
            return '';
        }

        $file = file(self::file());
        if ($file === false) {
            return '';
        }

        return implode('', array_slice($file, -$lines));
    }
}

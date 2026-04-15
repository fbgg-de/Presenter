<?php

class Logging
{
    private static string $filename = __DIR__ . '/../error.log';

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

        return file_put_contents(self::$filename, $logEntry, FILE_APPEND) !== false;
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
        if (!file_exists(self::$filename)) {
            return '';
        }
        return file_get_contents(self::$filename);
    }

    /**
     * Clear all logs
     */
    public static function clear(): bool
    {
        return file_put_contents(self::$filename, '') !== false;
    }

    /**
     * Get the last N lines from the log
     */
    public static function tail(int $lines = 100): string
    {
        if (!file_exists(self::$filename)) {
            return '';
        }

        $file = file(self::$filename);
        if ($file === false) {
            return '';
        }

        return implode('', array_slice($file, -$lines));
    }
}

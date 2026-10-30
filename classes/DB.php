<?php

require_once(__DIR__ . '/Statement.php');
require_once(__DIR__ . '/Transaction.php');

/**
 * A database fault: the server's problem, not the request's. RestController answers it with a
 * plain 500 and keeps the message (which can contain SQL) in the log, out of the browser.
 * Extends Error so existing `catch (Error)` blocks still see it.
 */
class DbError extends Error
{
}

class DB
{
    private static ?mysqli $db = null;

    private static function initMysqli(): void
    {
        if (!self::$db) {
            try {
                require_once(__DIR__ . '/../config.php');

                self::$db = new mysqli(
                    DB['host'],
                    DB['user'],
                    DB['password'],
                    DB['database']
                );

                // utf8mb4, not utf8: MySQL's "utf8" is still utf8mb3, and every table in
                // install.sql is utf8mb4. On a utf8mb3 connection a four-byte character —
                // an emoji in a song title, a band name, a style's JSON — is rejected by
                // strict mode or truncated at the offending byte.
                self::$db->set_charset('utf8mb4');
            } catch (Exception $e) {
                throw new DbError($e->getMessage());
            }
        }
    }

    public static function prepare(string $query): Statement
    {
        self::initMysqli();

        try {
            $stmt = self::$db->prepare($query);
        } catch (mysqli_sql_exception $e) {
            throw new DbError('could not prepare mysql statement: ' . $e->getMessage());
        }

        if ($stmt === false) {
            throw new DbError('could not prepare mysql statement (' . $query . ')');
        }

        return new Statement($stmt);
    }

    public static function transaction(): Transaction
    {
        self::initMysqli();
        self::$db->begin_transaction();

        return new Transaction(self::$db);
    }

    /**
     * Get the database connection instance
     * Protected to allow access from RestController and subclasses
     */
    protected static function getConnection(): mysqli
    {
        self::initMysqli();
        return self::$db;
    }
}

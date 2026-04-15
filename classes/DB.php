<?php

require_once(__DIR__ . '/Statement.php');
require_once(__DIR__ . '/Transaction.php');

class DB
{
    private static ?mysqli $db = null;

    private static function initMysqli(): void
    {
        if (!self::$db) {
            try {
                require_once(__DIR__ . '/../config.php');

                self::$db = new mysqli(
                    DB_HOST,
                    DB_USER,
                    DB_PASSWORD,
                    DB_DATABASE
                );

                self::$db->set_charset("utf8");
            } catch (Exception $e) {
                throw new Error($e->getMessage());
            }
        }
    }

    public static function prepare(string $query): Statement
    {
        self::initMysqli();

        try {
            $stmt = self::$db->prepare($query);
        } catch (mysqli_sql_exception $e) {
            throw new Error('could not prepare mysql statement: ' . $e->getMessage());
        }

        if ($stmt === false) {
            throw new Error('could not prepare mysql statement (' . $query . ')');
        }

        return new Statement($stmt);
    }

    public static function query(string $query): mysqli_result
    {
        self::initMysqli();

        try {
            $stmt = self::$db->query($query);
        } catch (mysqli_sql_exception $e) {
            throw new Error('could not query mysql statement: ' . $e->getMessage());
        }

        if ($stmt === false) {
            throw new Error('could not query mysql statement (' . $query . ')');
        }

        return new $stmt();
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

    // TODO remove
    public static function error(): void
    {
        if (self::$db) {
            print_r(self::$db->error);
        }
    }
}

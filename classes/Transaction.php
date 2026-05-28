<?php

class Transaction
{
    private mysqli $mysqli;

    public function __construct(mysqli $mysqli)
    {
        $this->mysqli = $mysqli;
    }

    public function commit(): void
    {
        $this->mysqli->commit();
    }

    public function rollback(): void
    {
        $this->mysqli->rollback();
    }
}

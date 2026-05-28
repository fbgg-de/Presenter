<?php

class Statement
{
    private mysqli_stmt $stmt;

    public function __construct(mysqli_stmt $stmt)
    {
        $this->stmt = $stmt;
    }

    private function throwError($message): void
    {
        if ($this->stmt->errno) {
            throw new Error('sql error ' . $this->stmt->errno . ': ' . $this->stmt->error);
        }

        throw new Error('sql error: ' . $message);
    }

    public function id(int | string | null &$id): Statement
    {
        $id = $this->stmt->insert_id;

        return $this;
    }

    public function rows(int | null &$rows): Statement
    {
        $result = $this->stmt->get_result();

        if ($result === false) {
            $this->stmt->store_result();
            $rows = $this->stmt->num_rows;
            $this->stmt->free_result();
        } else {
            $rows = $result->num_rows;
        }

        return $this;
    }

    public function affected(int | null &$rows): Statement
    {
        $rows = $this->stmt->affected_rows;

        return $this;
    }

    public function bind_param(string $types, $param1, ...$params): Statement
    {
        if (!$this->stmt->bind_param($types, $param1, ...$params)) {
            $this->throwError('could not bind parameters');
        }

        return $this;
    }

    public function execute(): Statement
    {
        try {
            if (!$this->stmt->execute()) {
                $this->throwError('could not execute statement');
            }
        } catch (mysqli_sql_exception $e) {
            $this->throwError($e->getMessage());
        }

        return $this;
    }

    public function bind_result(&$param1, &...$params): Statement
    {
        if (!$this->stmt->bind_result($param1, ...$params)) {
            $this->throwError('could not bind result');
        }

        return $this;
    }

    public function fetch(): ?bool
    {
        return $this->stmt->fetch();
    }

    public function fetchOne(&$result): Statement
    {
        $stmtResult = $this->stmt->get_result();
        if ($stmtResult === false) {
            $this->throwError('could not get result');
        }

        $result = $stmtResult->fetch_assoc();

        return $this;
    }

    public function fetchAll(&$result): Statement
    {
        $stmtResult = $this->stmt->get_result();
        if ($stmtResult === false) {
            $this->throwError('could not get result');
        }

        $result = $stmtResult->fetch_all(MYSQLI_ASSOC);

        return $this;
    }

    public function store_result(): Statement
    {
        if (!$this->stmt->store_result()) {
            $this->throwError('could not store statement results');
        }

        return $this;
    }

    public function free_result(): Statement
    {
        $this->stmt->free_result();

        return $this;
    }

    public function close(): void
    {
        if ($this->stmt->errno) {
            throw new Error('error (' . $this->stmt->errno . ': ' . $this->stmt->error . ')');
        }

        if (!$this->stmt->close()) {
            throw new Error('could not close mysqli statement');
        }
    }
}

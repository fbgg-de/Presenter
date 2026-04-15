<?php

interface Rest
{
    public function handle(Request $req): never;
}

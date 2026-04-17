import argparse
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

import pymysql


SQLITE_DB_PATH = Path(__file__).resolve().parent / "h429_data.db"
DEFAULT_SOCKET = "/run/mysqld/mysqld.sock"
TYPE_MAP = {
    "INTEGER": "BIGINT",
    "REAL": "DOUBLE",
    "TEXT": "TEXT",
    "DATETIME": "DATETIME",
}


def quote_identifier(name: str) -> str:
    return "`" + name.replace("`", "``") + "`"


def normalize_type(sqlite_type: str) -> str:
    normalized = (sqlite_type or "").strip().upper()
    return TYPE_MAP.get(normalized, "TEXT")


def normalize_value(sqlite_type: str, value):
    if value is None:
        return None

    normalized_type = (sqlite_type or "").strip().upper()
    if normalized_type != "DATETIME":
        return value

    if isinstance(value, datetime):
        parsed = value
    else:
        text = str(value).strip()
        if not text:
            return None
        try:
            parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        except ValueError:
            return text.replace("T", " ")

    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)

    return parsed.strftime("%Y-%m-%d %H:%M:%S")


def fetch_sqlite_tables(conn: sqlite3.Connection) -> list[str]:
    rows = conn.execute(
        """
        SELECT name
        FROM sqlite_master
        WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
        """
    ).fetchall()
    return [row[0] for row in rows]


def fetch_sqlite_columns(conn: sqlite3.Connection, table_name: str) -> list[tuple[str, str, bool]]:
    rows = conn.execute(f'PRAGMA table_info("{table_name}")').fetchall()
    return [(row[1], row[2], bool(row[3])) for row in rows]


def create_database(mysql_conn: pymysql.connections.Connection, database_name: str) -> None:
    with mysql_conn.cursor() as cursor:
        cursor.execute(
            f"CREATE DATABASE IF NOT EXISTS {quote_identifier(database_name)} "
            "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
        )
    mysql_conn.commit()


def recreate_table(
    mysql_conn: pymysql.connections.Connection,
    database_name: str,
    table_name: str,
    columns: list[tuple[str, str, bool]],
) -> None:
    column_sql = []
    for column_name, sqlite_type, not_null in columns:
        null_sql = "NOT NULL" if not_null else "NULL"
        column_sql.append(f"{quote_identifier(column_name)} {normalize_type(sqlite_type)} {null_sql}")

    ddl = (
        f"DROP TABLE IF EXISTS {quote_identifier(database_name)}.{quote_identifier(table_name)};"
        f"CREATE TABLE {quote_identifier(database_name)}.{quote_identifier(table_name)} ("
        + ", ".join(column_sql)
        + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    )

    with mysql_conn.cursor() as cursor:
        for statement in ddl.split(";"):
            statement = statement.strip()
            if statement:
                cursor.execute(statement)
    mysql_conn.commit()


def import_table(
    sqlite_conn: sqlite3.Connection,
    mysql_conn: pymysql.connections.Connection,
    database_name: str,
    table_name: str,
    columns: list[tuple[str, str, bool]],
    batch_size: int,
) -> int:
    column_names = [column[0] for column in columns]
    placeholders = ", ".join(["%s"] * len(column_names))
    insert_sql = (
        f"INSERT INTO {quote_identifier(database_name)}.{quote_identifier(table_name)} "
        f"({', '.join(quote_identifier(name) for name in column_names)}) "
        f"VALUES ({placeholders})"
    )

    sqlite_cursor = sqlite_conn.execute(f'SELECT * FROM "{table_name}"')
    total_rows = 0

    while True:
        batch = sqlite_cursor.fetchmany(batch_size)
        if not batch:
            break

        normalized_batch = [
            tuple(normalize_value(columns[index][1], row[index]) for index in range(len(columns)))
            for row in batch
        ]

        with mysql_conn.cursor() as mysql_cursor:
            mysql_cursor.executemany(insert_sql, normalized_batch)
        mysql_conn.commit()

        total_rows += len(batch)
        print(f"{table_name}: imported {total_rows} rows")

    return total_rows


def fetch_mysql_count(
    mysql_conn: pymysql.connections.Connection,
    database_name: str,
    table_name: str,
) -> int:
    with mysql_conn.cursor() as cursor:
        cursor.execute(f"SELECT COUNT(*) FROM {quote_identifier(database_name)}.{quote_identifier(table_name)}")
        return int(cursor.fetchone()[0])


def main() -> None:
    parser = argparse.ArgumentParser(description="Import a SQLite database into MariaDB.")
    parser.add_argument("--sqlite-db", default=str(SQLITE_DB_PATH))
    parser.add_argument("--mysql-user", required=True)
    parser.add_argument("--mysql-password", required=True)
    parser.add_argument("--mysql-host", default="localhost")
    parser.add_argument("--mysql-port", type=int, default=3306)
    parser.add_argument("--mysql-socket", default=DEFAULT_SOCKET)
    parser.add_argument("--mysql-database", default="h429")
    parser.add_argument("--batch-size", type=int, default=5000)
    args = parser.parse_args()

    sqlite_conn = sqlite3.connect(args.sqlite_db)
    sqlite_conn.row_factory = None

    mysql_conn = pymysql.connect(
        user=args.mysql_user,
        password=args.mysql_password,
        host=args.mysql_host,
        port=args.mysql_port,
        unix_socket=args.mysql_socket,
        charset="utf8mb4",
        autocommit=False,
    )

    try:
        create_database(mysql_conn, args.mysql_database)
        tables = fetch_sqlite_tables(sqlite_conn)
        for table_name in tables:
            columns = fetch_sqlite_columns(sqlite_conn, table_name)
            recreate_table(mysql_conn, args.mysql_database, table_name, columns)
            sqlite_count = import_table(
                sqlite_conn=sqlite_conn,
                mysql_conn=mysql_conn,
                database_name=args.mysql_database,
                table_name=table_name,
                columns=columns,
                batch_size=args.batch_size,
            )
            mysql_count = fetch_mysql_count(mysql_conn, args.mysql_database, table_name)
            print(f"{table_name}: sqlite={sqlite_count}, mariadb={mysql_count}")
    finally:
        sqlite_conn.close()
        mysql_conn.close()


if __name__ == "__main__":
    main()

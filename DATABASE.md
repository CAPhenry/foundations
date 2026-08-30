# Database setup

HMP Foundations requires MySQL 8.x or MariaDB 10.6 or newer. The database may run on the same machine
as the HogwartsMP server, on another machine, or in a container.

Foundations creates and upgrades its own tables at startup. There is no schema file to import. The
operator only creates an empty database and a database-scoped user.

## Option 1: existing MySQL or MariaDB server

Open the MySQL/MariaDB command-line client or an administration tool as a database administrator and
run the following statements. Replace the password before running them.

```sql
CREATE DATABASE `hogwartsmp`
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

CREATE USER 'hogwartsmp'@'localhost'
    IDENTIFIED BY 'REPLACE_WITH_A_LONG_RANDOM_PASSWORD';

GRANT ALL PRIVILEGES ON `hogwartsmp`.*
    TO 'hogwartsmp'@'localhost';
```

`localhost` is correct when the game server and database are on the same machine. When they are on
different machines, replace it with the game server's exact IP address or a deliberately restricted
subnet. Do not use `%` unless the network and firewall already provide equivalent restriction.

MySQL normally resolves a TCP connection to `127.0.0.1` as the `localhost` account. If the database
runs with `skip_name_resolve`, create and grant `'hogwartsmp'@'127.0.0.1'` instead.

This grants control over the `hogwartsmp` database only—not global database-server administration.
Schema privileges are required because Foundations resources run versioned migrations. MySQL accounts
are identified by both user and host, so an “access denied” error can mean the password is right but
the allowed host is wrong.

Verify the account from the same machine that will run HogwartsMP:

```sh
mysql --host=127.0.0.1 --port=3306 --user=hogwartsmp --password --database=hogwartsmp --execute="SELECT 1"
```

For a remote database, replace `127.0.0.1` with its hostname. Also configure the database listener,
firewall, and TLS according to the database provider's instructions. Never expose port 3306 directly
to the public internet.

## Option 2: Docker on the game-server machine

This creates MySQL 8.4 with persistent storage and publishes it only on local loopback:

```sh
docker run --name hogwartsmp-mysql --restart unless-stopped -e MYSQL_ROOT_PASSWORD=REPLACE_ROOT_PASSWORD -e MYSQL_DATABASE=hogwartsmp -e MYSQL_USER=hogwartsmp -e MYSQL_PASSWORD=REPLACE_GAME_PASSWORD -p 127.0.0.1:3306:3306 -v hogwartsmp-mysql-data:/var/lib/mysql -d mysql:8.4
```

Wait until `docker logs hogwartsmp-mysql` reports that the server is ready, then configure Foundations
with `REPLACE_GAME_PASSWORD`. Keep the root password separate; Foundations never needs it.

If HogwartsMP also runs in a container, `127.0.0.1` means that game-server container, not the database
container. Put both services on the same private container network and use the database service/container
name as `HMP_MYSQL_HOST` instead.

## Configure Foundations

Choose either environment variables or a JSON file. Environment values override the JSON file.

### Environment variables

Set a connection URL in the process that launches the HogwartsMP dedicated server:

```text
HMP_MYSQL_URL=mysql://hogwartsmp:REPLACE_GAME_PASSWORD@127.0.0.1:3306/hogwartsmp
```

Characters such as `@`, `:`, `/`, `#`, and `%` in a URL password must be percent-encoded. To avoid
URL encoding, set the individual variables instead:

```text
HMP_MYSQL_HOST=127.0.0.1
HMP_MYSQL_PORT=3306
HMP_MYSQL_USER=hogwartsmp
HMP_MYSQL_PASSWORD=REPLACE_GAME_PASSWORD
HMP_MYSQL_DATABASE=hogwartsmp
```

The supplied `environment.example` is documentation only. Foundations does not automatically load
`.env` files. Add these values to the Windows/Linux service, process manager, container configuration,
or the shell that actually starts the server.

For a one-session PowerShell launch, environment variables can be set immediately before the server:

```powershell
Set-Location C:\HogwartsMPServer
$env:HMP_MYSQL_URL = "mysql://hogwartsmp:REPLACE_GAME_PASSWORD@127.0.0.1:3306/hogwartsmp"
.\HogwartsMPServer.exe
```

Closing that PowerShell window discards the variables. A production service must define them in its
own service/container configuration.

For a one-session Linux shell launch:

```sh
cd /opt/hogwartsmp
export HMP_MYSQL_URL='mysql://hogwartsmp:REPLACE_GAME_PASSWORD@127.0.0.1:3306/hogwartsmp'
./HogwartsMPServer
```

Closing that shell discards the variable. For systemd, put the individual `HMP_MYSQL_*` values in the
protected `EnvironmentFile` described in [INSTALL.md](INSTALL.md#linux-launch). This avoids URL-encoding
surprises and keeps credentials out of the unit file.

### JSON configuration

Alternatively, create `<server-root>/data/hmp-mysql.json`:

```json
{
  "enabled": true,
  "host": "127.0.0.1",
  "port": 3306,
  "user": "hogwartsmp",
  "password": "REPLACE_GAME_PASSWORD",
  "database": "hogwartsmp",
  "connectionLimit": 10,
  "queueLimit": 0,
  "connectTimeout": 10000,
  "ssl": false,
  "charset": "utf8mb4",
  "timezone": "Z",
  "dateStrings": true
}
```

Restrict access to this file because it contains a database password. `<server-root>` means the
server process's working directory, normally the directory containing `HogwartsMPServer.exe` on
Windows or `HogwartsMPServer` on Linux. On Linux, make the file readable only by the service account:

```sh
sudo chown hogwartsmp:hogwartsmp /opt/hogwartsmp/data/hmp-mysql.json
sudo chmod 600 /opt/hogwartsmp/data/hmp-mysql.json
```

Replace `hogwartsmp:hogwartsmp` when the service uses a different account.

For a remote database with a publicly trusted TLS certificate, set `ssl` or `HMP_MYSQL_SSL` to `true`.
Foundations then requires certificate verification; do not disable verification to work around an
untrusted certificate.

## First connection and migrations

Start the HogwartsMP server from `<server-root>`. A successful database connection logs:

```text
[hmp-mysql] connected to HOST:PORT/DATABASE
```

The remaining resources then create their tables. Applied migration versions and checksums are stored
in `hmp_schema_migrations`. Do not edit that table or manually create individual Foundations tables.
If startup fails, stop the server and correct the database problem before allowing players to connect.
The database must already be accepting connections before HogwartsMP starts.

Useful checks from a database administrator session:

```sql
SHOW TABLES FROM `hogwartsmp`;
SELECT resource, version, name, applied_at
FROM `hogwartsmp`.`hmp_schema_migrations`
ORDER BY resource, version;
```

## Backups and upgrades

Back up both the database and `<server-root>/data/hmp-*.json` before every Foundations upgrade. A basic
logical backup is:

```sh
mysqldump --host=127.0.0.1 --port=3306 --user=hogwartsmp --password --single-transaction --result-file=hogwartsmp-backup.sql hogwartsmp
```

MariaDB users can use `mariadb-dump` with the equivalent options. Follow the database provider's
backup procedure when using a managed service. Foundations migrations are forward-only; rolling code
back does not reverse a migrated database.

Official references: [MySQL account names](https://dev.mysql.com/doc/refman/8.4/en/account-names.html),
[MySQL `CREATE USER`](https://dev.mysql.com/doc/refman/8.4/en/create-user.html),
[MySQL `GRANT`](https://dev.mysql.com/doc/refman/8.4/en/grant.html), and the
[Docker Official MySQL image](https://hub.docker.com/_/mysql/).

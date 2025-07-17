<p align="center"><a href="https://cube.dev"><img src="https://i.imgur.com/zYHXm4o.png" alt="Cube.js" width="300px"></a></p>

[Website](https://cube.dev) • [Docs](https://cube.dev/docs) • [Blog](https://cube.dev/blog) • [Slack](https://slack.cube.dev) • [Twitter](https://twitter.com/the_cube_dev)

# Cube.js Stripe Sigma API Driver

A Cube.js driver for querying data using the Stripe Sigma API.

## Usage

Configure your Cube.js backend to use the Sigma driver and provide your Stripe API key.

## Parameterized Queries

SigmaDriver now supports positional parameterized queries using `?` placeholders in your SQL. Parameters are safely interpolated into the SQL string:

- Strings are single-quoted and single quotes are escaped.
- Numbers and booleans are inserted as-is.
- `null` and `undefined` are converted to `NULL`.

**Example:**

```js
await driver.query('SELECT * FROM users WHERE id = ? AND status = ?', [123, 'active']);
```

**Security Note:** Only use parameterized queries with trusted SQL templates. The driver escapes values, but does not prevent all possible SQL injection risks if the query template itself is user-controlled.

## License

Cube.js Sigma Driver is [Apache 2.0 licensed](./LICENSE).

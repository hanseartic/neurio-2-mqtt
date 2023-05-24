# 🏘neurio ➡️ MQTT📡

Publish readings from local neurio sensor API sensor to a MQTT broker.

## ⚙️ Configuration

Configuration is stored in [`.toml`](https://toml.io/en/)-files. There is a
[default configuration](app/defaultConfig/default.toml) file that should not be
changed but provides basic settings (e.g. device-name, topics, ...).

Most settings can be kept as is but at least the connections to MQTT and the
neurio sensor need customization. Settings stored in `app/config/local.toml`
override settings in the [default configuration](app/defaultConfig/default.toml)
file.

To customize the configuration first get ahold of the default configuration via:

```bash
docker run --rm -v $(pwd)/config:/app/config hanseartic/neurio-2-mqtt init
```

You will now find a copy of the default config in `config/local.toml`.

Edit that file to meet your setup. The `[bridge]` section _must not_ be changed
when running with docker.

So a minimal `local.toml` file could look like this:

```toml
[sensors.1]
host = "10.0.0.101"

[mqtt]
host = "10.0.0.100"
```

## Running the bridge

Now run the bridge:

```bash
docker run --rm --name neurio-2-mqtt -p8080:8080 --restart always -dv $(pwd)/config:/app/config:ro hanseartic/neurio-2-mqtt
```

## Homeassistant discovery

The bridge supports homeassistant
[MQTT discovery](https://www.home-assistant.io/integrations/mqtt/#mqtt-discovery).
To publish discovery topics to the MQTT broker send a `USR1` signal to the
process.

docker (given you started with the `--name` used above):

```bash
docker kill -s USR1 neurio-2-mqtt
```

To send the signal to local instance you need to find the process id and then

```bash
kill -USR1 <pid of node index.js>
```

## API

The bridge provides two REST endpoints. After the bridge was started find them
at

- `localhost:8080/discovery` listing of all discovery topics
- `localhost:8080/readings` current sample from all configured sensors
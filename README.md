# ⚡generac 📟MQTT 🌉bridge

Publish local generac PWRview sensor readings to a MQTT broker.

## TL;DR

Generac (formerly neurio.io) sensors provide a local JSON API publishing the
readings.

This bridge publishes these local readings to a [MQTT](https://mqtt.org/)
broker. Following this approach dependencies to generac cloud are cut and
reliability of your local setup is increased.

## Configuration

The bridge can be run as a docker container or using node directly.

Configuration is done with [`.toml`](https://toml.io/en/)-files.

Either way the bridge needs to be configured. A default configuration is in
place to provide defaults. But at least the connections to mqtt and the generac
sensor need customization.

Configurations made in [`app/config/local.toml`](app/config/local.toml) override
setting in the [default configuration](app/defaultConfig/default.toml) file.

So a minimal `local.toml` file could look like this:

```toml
[sensors.1]
host = "10.0.0.101"

[mqtt]
host = "10.0.0.100"
```

Read to the next section where and how to find that config file.

## Running the bridge

### Docker

First get ahold of the default configuration via:

```bash
docker run --rm -v $(pwd)/config:/app/config hanseartic/generac_mqtt_bridge init
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

Now run the bridge:

```bash
docker run --rm --name generac_mqtt_bridge -dv $(pwd)/config:/app/config:ro hanseartic/generac_mqtt_bridge
```

### Local bridge

Running locally with node is only advised while setting up or figuring out your
configuration.

```bash
git clone https://github.com/hanseartic/generac_mqtt_bridge.git
cd generac_mqtt_bridge/app
npm ci
```

Now you need to configure the connection to the sensor and your MQTT broker. See
in the above **docker** section for details.

Start locally

```bash
npm start
## or
node index.js
```

## Homeassistant discovery

The bridge supports homeassistant
[MQTT discovery](https://www.home-assistant.io/integrations/mqtt/#mqtt-discovery).
To publish discovery topics to the MQTT broker send a `USR1` signal to the
process.

docker (given you started with the `--name` used above):

```bash
docker kill -s USR1 generac_mqtt_bridge
```

To send the signal to local instance you need to find the process id and then

```bash
kill -USR1 <pid of node index.js>
```

## API

The bridge provides two REST endpoints. After the bridge was started find them
at

- `localhost:8080/discovery` listing of all discovery topics
- `localhost:8080/readings` current sample from all configured generac sensors

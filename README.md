# 🏘neurio ➡️ MQTT📡

Publish readings from local neurio sensor API sensor to a
[MQTT](https://mqtt.org/) broker.

## 📰 TL;DR

neurio (aka Generac PWRview) sensors provide a local JSON API that allows direct
reading of the sensor data without using the
[generac cloud](mypwrview.generac.com).

This bridge publishes these local readings to a MQTT broker.

## ⚙️ Configuration

The bridge can be run as a **docker container** or **locally** using node
directly.

Either way the bridge needs to be configured. A default configuration is in
place to provide defaults where applicable.

Configuration is stored in [`.toml`](https://toml.io/en/)-files. There is a
[default configuration](app/defaultConfig/default.toml) file that should not be
changed but provides basic settings.

Most settings can be kept as is but at least the connections to MQTT and the
neurio sensor need customization. Settings stored in `app/config/local.toml`
override settings in the [default configuration](app/defaultConfig/default.toml)
file.

So a minimal `local.toml` file could look like this:

```toml
[sensors.1]
host = "10.0.0.101"

[mqtt]
host = "10.0.0.100"
```

Read to the next section where and how to find that custom config file.

## Running the bridge

### 🐳 Docker

First get ahold of the default configuration via:

```bash
docker run --rm -v $(pwd)/config:/app/config hanseartic/neurio_2_mqtt init
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
docker run --rm --name neurio_2_mqtt -dv $(pwd)/config:/app/config:ro hanseartic/neurio_2_mqtt
```

### 💻 Local bridge

Running locally with node is only advised while setting up or figuring out your
configuration.

```bash
git clone https://github.com/hanseartic/neurio_2_mqtt.git
cd neurio_2_mqtt/app
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
docker kill -s USR1 neurio_2_mqtt
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

# 🏘neurio ➡️ MQTT

[![source on github](https://img.shields.io/badge/source%20on%20github-181717?style=flat-square&logo=github&logoColor=white)](https://github.com/hanseartic/neurio-2-mqtt/)
[![dockerhub](https://img.shields.io/badge/docker%20hub-2496ED?style=flat-square&logo=docker&logoColor=white)](https://hub.docker.com/r/hanseartic/neurio-2-mqtt)
[![ghcr](https://img.shields.io/badge/ghcr.io-181717?style=flat-square&logo=docker&logoColor=white)](https://ghcr.io/hanseartic/neurio-2-mqtt:latest)
![GitHub Release Date](https://img.shields.io/github/release-date/hanseartic/neurio-2-mqtt?style=flat-square)

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

```shell
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

## ➡️ Running the bridge

After configuration has been customized just start forwarding the sensor
readings with the following command:

```shell
docker run --rm --name neurio-2-mqtt -p8080:8080 --restart always -dv $(pwd)/config:/app/config:ro hanseartic/neurio-2-mqtt
```

## 👀 Homeassistant discovery

The bridge supports homeassistant
[MQTT discovery](https://www.home-assistant.io/integrations/mqtt/#mqtt-discovery).
To publish discovery topics to the MQTT broker send a `USR1` signal to the
process:

```shell
docker kill -s USR1 neurio-2-mqtt
```

## 🧩 API

The bridge provides two REST endpoints:

- `localhost:8080/discovery` listing of all discovery topics
- `localhost:8080/healthcheck` healthcheck endpoint returning 200 when the last
  reading is not older than configured update interval; this is also checked by
  docker for healthyness probes
- `localhost:8080/readings` current sample from all configured sensors

---

[![homeassistant](https://img.shields.io/badge/home%20assistant-41BDF5?style=for-the-badge&logo=homeassistant&logoColor=white)](https://www.home-assistant.io/)
[![mosquitto](https://img.shields.io/badge/mosquitto-3C5280?style=for-the-badge&logo=eclipsemosquitto&logoColor=white)](https://mosquitto.org/)
[![MQTT](https://img.shields.io/badge/MQTT-660066?style=for-the-badge&logo=MQTT&logoColor=white)](https://mqtt.org)

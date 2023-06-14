import path, { delimiter } from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

process.env.NODE_CONFIG_DIR = __dirname + '/config/'
    + delimiter
    + __dirname + '/defaultConfig/';

import { stringify } from '@tauri-apps/toml';
import humanDate from 'humanize-duration';
import configUncached from 'config-reloadable';
import express from 'express';
import fetch, { AbortError, FetchError } from 'node-fetch';
import timeoutSignal from 'timeout-signal';
import fs from 'fs';
import { parse } from 'node-html-parser';
import { connect } from 'mqtt';

let config = configUncached();
let readings = {};

var defaultConfig = config.util.getConfigSources().find(s => s.name === __dirname + '/defaultConfig/default.toml').parsed;
var customConfig = config.util.diffDeep(defaultConfig, config.util.toObject(configUncached()));
console.log(customConfig);

const app = express();
const startedAt = new Date().toISOString().split('.')[0] + "Z";
const sensorQueryTimeout = 500;

app.get('/readings', (_, res) => {
    res.status(200).send(readings);
});

app.get('/discovery', (_, res) => {
    generateDiscoveryTopics().then(t => res.send(t));
});

app.get('/healthcheck', (_, res) => {
    const readingAge = Date.now() - lastReading;
    const uptime = humanDate(process.uptime() * 1000, { maxDecimalPoints: 0 });
    const response = {
        readingAge,
        toleratedAge: config.sensors.query_interval + sensorQueryTimeout,
        uptime,
    };
    response.sensors = getSensors().reduce((a, b) => {
        const status = (b.readings?.status ?? 500) == 200 ? "OK" : "N/A";
        return { ...a, [b.name]: { status: status } };
    }, {});

    res.status(200).send(response);
    const c = getMQTTClient();
    c.publish(`${config.mqtt.topic}/state`, JSON.stringify({
        started_at: startedAt,
        uptime
    }));
});


const publishReadings = async (reading) => {
    const c = getMQTTClient();

    readings[reading.name] = reading;

    c.publish(`${config.mqtt.topic}/${reading.name}/state`, JSON.stringify({
        status: reading.status,
        last_update: reading.content?.timestamp ?? new Date().toISOString().split('.')[0] + "Z",
    }));

    if (!reading.content?.channels) return;
    for (const channel of reading.content.channels) {
        const type = channel.type.replace('_CONSUMPTION', '');
        c.publish(`${config.mqtt.topic}/${reading.name}/${type}/state`, JSON.stringify(channel));
    }
};

const getSensors = () => {
    const sensors = [];
    for (const sensorName in config.sensors) {
        const sensorConfig = config.sensors[sensorName];
        if (typeof sensorConfig !== 'object') { continue; }
        const sensor = { name: sensorName, config: sensorConfig };
        const sensorReadings = readings[sensorName];
        if (sensorReadings) {
            sensor.readings = sensorReadings;
        }
        sensors.push(sensor);
    }
    return sensors;
};

const generateDiscoveryTopics = async () => {
    const topics = {};

    for (const sensor of getSensors()) {
        const sensorReadings = sensor.readings;
        const dev = {
            name: sensorReadings.name,
            ids: sensorReadings.content.sensorId,
            model: sensorReadings.model,
            configuration_url: `http://${sensor.config.host}`,
            manufacturer: 'Generac',
            via_device: 'neurio-2-mqtt'
        };
        await fetch(`http://${sensor.config.host}`, { method: 'GET', signal: timeoutSignal(1500) })
            .then(res => res.text())
            .then(text => {
                const lines = parse(text).querySelector('.col-sm-6').innerHTML
                    .split('<br>')
                    .filter(l => l.includes('Version'))
                    .reduce((a, b) => {
                        var k_v = b.split(': ');
                        a[k_v[0]] = k_v[1];
                        return a;
                    }, {});
                dev.hw_version = lines['Hardware Version'];
                dev.sw_version = lines['Firmware Version'];
            })
            .catch(() => {});

        const id = sensor.name;
        const availability = {
            topic: `${config.mqtt.topic}/${id}/state`,
            value_template: "{{ 'online' if value_json.status == 200 else 'offline' }}",
        };

        const sensorTopics = sensorReadings.content.channels.reduce((a, b) => {
            const type = b.type.replace('_CONSUMPTION', '');
            const template = {
                name: `${sensorReadings.name} ${type.replace('_', ' ')}`,
                unique_id: `${sensorReadings.content.sensorId}_${b.ch}`,
                state_topic: `${config.mqtt.topic}/${id}/${type}/state`,
                dev,
                availability,
                expire_after: 95,
            };

            a[`${config.homeassistant.discovery_topic}/sensor/neurio-${sensorReadings.content.sensorId}/${type}_eImp_Wh`] = {
                ...template,
                name: template.name + ' Energy In',
                unique_id: template.unique_id + '_eImp_Wh',
                value_template: '{{ value_json.eImp_Ws // 3600 }}',
                unit_of_measurement: 'Wh',
                device_class: 'energy',
                state_class: 'total_increasing',
                expire_after: 95,
                icon: 'mdi:transmission-tower-export',
            };
            a[`${config.homeassistant.discovery_topic}/sensor/neurio-${sensorReadings.content.sensorId}/${type}_eExp_Wh`] = {
                ...template,
                name: template.name + ' Energy Out',
                unique_id: template.unique_id + '_eExp_Wh',
                value_template: '{{ value_json.eExp_Ws // 3600 }}',
                unit_of_measurement: 'Wh',
                device_class: 'energy',
                state_class: 'total_increasing',
                icon: 'mdi:transmission-tower-import',
            };
            a[`${config.homeassistant.discovery_topic}/sensor/neurio-${sensorReadings.content.sensorId}/${type}_p_W`] = {
                ...template,
                name: template.name + ' Power',
                unique_id: template.unique_id + '_p_W',
                value_template: '{{ value_json.p_W }}',
                unit_of_measurement: 'W',
                device_class: 'power',
                state_class: 'measurement',
            };
            a[`${config.homeassistant.discovery_topic}/sensor/neurio-${sensorReadings.content.sensorId}/${type}_v_V`] = {
                ...template,
                name: template.name + ' Voltage',
                unique_id: template.unique_id + '_v_V',
                value_template: '{{ value_json.v_V }}',
                unit_of_measurement: 'V',
                device_class: 'voltage',
                state_class: 'measurement',
            };
            a[`${config.homeassistant.discovery_topic}/sensor/neurio-${sensorReadings.content.sensorId}/${type}_q_VAR`] = {
                ...template,
                name: template.name + ' Reactive Power',
                unique_id: template.unique_id + '_q_VAR',
                value_template: '{{ value_json.q_VAR }}',
                unit_of_measurement: 'var',
                device_class: 'reactive_power',
                state_class: 'measurement',
                icon: 'mdi:flash-outline',
            };
            return a;
        }, {});
        for (const topic in sensorTopics) {
            topics[topic] = sensorTopics[topic];
        };
        topics[`${config.homeassistant.discovery_topic}/binary_sensor/neurio-${sensorReadings.content.sensorId}_available/config`] = {
            name: `${sensorReadings.name} available`,
            unique_id: `${sensorReadings.content.sensorId}_available`,
            state_topic: `${config.mqtt.topic}/${id}/state`,
            value_template: "{{ 'ON' if value_json.status == 200 else 'OFF' }}",
            dev,
            device_class: 'connectivity',
            entity_category: 'diagnostic',
        };
        topics[`${config.homeassistant.discovery_topic}/sensor/neurio-2-mqtt/started_at/config`] = {
            name: `Started`,
            unique_id: 'neurio2mqtt_started_at',
            state_topic: `${config.mqtt.topic}/state`,
            value_template: '{{ value_json.started_at }}',
            dev: {
                name: 'neurio-2-mqtt',
                ids: 'neurio-2-mqtt',
                manufacturer: 'hanseartic',
                configuration_url: 'https://github.com/hanseartic/neurio-2-mqtt',
                sw_version: process.env.VERSION,
            },
            device_class: 'date',
            entity_category: 'diagnostic',
        };
    }
    return topics;
};

let lastReading = 0;
const requestLoop = async () => {
    const sensorQueries = [];
    for (const sensorName in config.sensors) {
        const sensorConfig = config.sensors[sensorName];
        if (typeof sensorConfig !== 'object') { continue; }

        const sensorUrl = `http://${sensorConfig.host}/current-sample`;
        const currentSensor = { name: sensorName, model: sensorConfig.device_model };

        const requestPromise = fetch(sensorUrl, { method: "GET", signal: timeoutSignal(sensorQueryTimeout) })
            .then(res => res.json())
            .then(content => {
                lastReading = Date.now();
                return { status: 200, content, ...currentSensor };
            })
            .catch(e => {
                if (e instanceof AbortError || e instanceof FetchError) {
                    return { status: 504, error: `sensor API not reachable at ${sensorUrl}`, ...currentSensor, m: e.message };
                } else {
                    return { status: 502, ...currentSensor, content: 'oops' };
                }
            });
        sensorQueries.push(requestPromise);
    }

    await Promise
        .all(sensorQueries)
        .then(sensorReadings => {
            for (const reading of sensorReadings) {
                publishReadings(reading);
                if (reading) {
                } else {
                    //console.log(reading);
                }
            }
        })
        .catch(console.log);

    if (config.sensors.query_interval) {
        setTimeout(requestLoop, config.sensors.query_interval);
    }
};


let configChangedTs = Date.now();
fs.watch(__dirname + '/config', (type, filename) => {
    const lastModified = fs.statSync(__dirname + '/config/' + filename).mtimeMs;
    if (type !== 'change' || lastModified === configChangedTs) return;
    configChangedTs = lastModified;
    console.log(type, filename);
    config = configUncached.reloadConfigs();
});

const getMQTTClient = () => {
    const clientOptions = {
        username: config.mqtt.user ? config.mqtt.user : null,
        password: config.mqtt.password ? config.mqtt.password : null,
    };

    return connect(`${config.mqtt.proto}://${config.mqtt.host}:${config.mqtt.port}`, clientOptions);
}

app.listen(config.bridge.port, () => {
    console.log('listening on ' + config.bridge.port);
    requestLoop();
});

process.on('SIGUSR1', () => {
    generateDiscoveryTopics().then(t => {
        if (!t) { return; }
        console.log('Publishing homeassistant discovery topics to MQTT');

        const c = getMQTTClient();
        c.on('connect', () => {
            Object.keys(t).forEach(k => {
                console.log(`${k}/config`);
                c.publish(`${k}/config`, JSON.stringify(t[k]), { qos: 0, retain: true });
            })
         });
    });
});

const terminate = () => {
    console.log("bye");
    process.exit();
};

process
    .on('SIGINT', terminate)
    .on('SIGTERM', terminate);

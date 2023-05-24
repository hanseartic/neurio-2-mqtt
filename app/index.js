import path, { delimiter } from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

process.env.NODE_CONFIG_DIR = __dirname + '/config/'
    + delimiter
    + __dirname + '/defaultConfig/';

import { stringify } from '@tauri-apps/toml';
import configUncached from 'config-reloadable';
import express from 'express';
import fetch, { AbortError } from 'node-fetch';
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
app.get('/readings', (req, res) => {
    res.status(200).send(readings);
});

app.get('/discovery', (_, res) => {
    generateDiscoveryTopics().then(t => res.send(t));
});

app.listen(config.bridge.port, () => {
    console.log('listening on ' + config.bridge.port);
});


const publishReadings = async (readings) => {
    const c = getMQTTClient();
    for (const channel of readings.content.channels) {
        const type = channel.type.replace('_CONSUMPTION', '');
        //console.log(`publishing to '${config.mqtt.topic}/${readings.name}/${type}/state'`, channel);
        c.publish(`${config.mqtt.topic}/${readings.name}/${type}/state`, JSON.stringify(channel));
    }
};

const generateDiscoveryTopics = async () => {
    const topics = {};

    for (const sensorId in config.sensors) {
        const sensor = config.sensors[sensorId];
        if (typeof sensor !== 'object') { continue; }
        const sensorReadings = readings[sensor.device_name];
        if (!sensorReadings) { continue; }

        const dev = {
            name: sensorReadings.name,
            ids: sensorReadings.content.sensorId,
            mdl: 'neurio',
            cu: `http://${sensor.host}`,
            mf: 'Generac',
        };
        await fetch(`http://${sensor.host}`, { method: 'GET', signal: timeoutSignal(1500) })
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
                dev.hw = lines['Hardware Version'];
                dev.sw = lines['Firmware Version'];
            });

        const id = sensor.device_name;

        const sensorTopics = sensorReadings.content.channels.reduce((a, b) => {
            const type = b.type.replace('_CONSUMPTION', '');

            a[`${config.homeassistant.discovery_topic}/sensor/neurio-${sensorReadings.content.sensorId}/${type}_eImp_Wh`] = {
                name: `${id} ${type} In`,
                uniq_id: `${sensorReadings.content.sensorId}_${b.ch}_eImp_Wh`,
                stat_t: `${config.mqtt.topic}/${id}/${type}/state`,
                val_tpl: '{{ value_json.eImp_Ws // 3600 }}',
                unit_of_meas: 'Wh',
                dev,
                dev_cla: 'energy',
                stat_cla: 'total_increasing',
                exp_aft: 5,
            };
            a[`${config.homeassistant.discovery_topic}/sensor/neurio-${sensorReadings.content.sensorId}/${type}_eExp_Wh`] = {
                name: `${id} ${type} Out`,
                uniq_id: `${sensorReadings.content.sensorId}_${b.ch}_eExp_Wh`,
                stat_t: `${config.mqtt.topic}/${id}/${type}/state`,
                val_tpl: '{{ value_json.eExp_Ws // 3600 }}',
                unit_of_meas: 'Wh',
                dev,
                exp_aft: 5,
                dev_cla: 'energy',
                stat_cla: 'total_increasing',
            };
            a[`${config.homeassistant.discovery_topic}/sensor/neurio-${sensorReadings.content.sensorId}/${type}_p_W`] = {
                name: `${id} ${type} Watt`,
                uniq_id: `${sensorReadings.content.sensorId}_${b.ch}_p_W`,
                stat_t: `${config.mqtt.topic}/${id}/${type}/state`,
                val_tpl: '{{ value_json.p_W }}',
                unit_of_meas: 'W',
                dev,
                exp_aft: 5,
                dev_cla: 'power',
                stat_cla: 'measurement',
            };
            a[`${config.homeassistant.discovery_topic}/sensor/neurio-${sensorReadings.content.sensorId}/${type}_v_V`] = {
                name: `${id} ${type} Volt`,
                uniq_id: `${sensorReadings.content.sensorId}_${b.ch}_v_V`,
                stat_t: `${config.mqtt.topic}/${id}/${type}/state`,
                val_tpl: '{{ value_json.v_V }}',
                unit_of_meas: 'V',
                dev,
                exp_aft: 5,
                dev_cla: 'voltage',
                stat_cla: 'measurement',
            };
            return a;
        }, {});
        for (const topic in sensorTopics) {
            topics[topic] = sensorTopics[topic];
        };
    }
    return topics;
};


const requestLoop = setInterval(() => {
    for (const sensorId in config.sensors) {
        const sensor = config.sensors[sensorId];
        if (typeof sensor !== 'object') { continue; }
        delete readings[sensor.device_name];
        const sensorUrl = `http://${sensor.host}/current-sample`;
        fetch(sensorUrl, { method: "GET", signal: timeoutSignal(1000) })
        .then(res => res.json())
        .then(json => {
            readings[sensor.device_name] = { status: 200, content: json, name: sensor.device_name, };
            publishReadings(readings[sensor.device_name]);
        })
        .catch(e => {
            if (e instanceof AbortError) {
                readings[sensor.device_name] = { status: 504, content: `sensor API not reachable at ${sensorUrl}`, name: sensor.device_name, };
            } else {
                readings[sensor.device_name] = { status: 500, content: e, name: sensor.device_name, };
            }
        });
    }
}, config.sensors.query_interval);


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

process.on('SIGUSR1', () => {
    generateDiscoveryTopics().then(t => {
        if (!t) { return; }
        console.log('Publishing homeassistant discovery topics to MQTT');

        const c = getMQTTClient();
        c.on('connect', () => {
            Object.keys(t).forEach(k => {
                console.log(`${k}/config`);
                c.publish(`${k}/config`, JSON.stringify(t[k]));
            })
         });
    });
});

process.on('SIGINT', () => {
    clearInterval(requestLoop);
    console.log("bye");
    process.exit();
});

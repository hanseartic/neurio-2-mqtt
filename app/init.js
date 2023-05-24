import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import fs from 'fs';

fs.stat(path.join(__dirname, 'config', 'local.toml'), (e, s) => {
    if (s) {
        console.log('custom config file already in place. not overwriting');
    } else {
        fs.copyFileSync(
            path.join(__dirname, 'defaultConfig', 'default.toml'),
            path.join(__dirname, 'config', 'local.toml')
        );

        console.log('copied default config to custom config (config/local.toml)');
    }
});


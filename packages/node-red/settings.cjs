const fs = require('fs');
const path = require('path');

const linkPath = path.join(__dirname, '.dev/lib/flows');
const targetPath = path.join(__dirname, 'examples');

if (!fs.existsSync(path.dirname(linkPath)))
	fs.mkdirSync(path.dirname(linkPath), { recursive: true });
if (!fs.existsSync(linkPath))
	fs.symlinkSync(targetPath, linkPath, 'dir');

module.exports = {
	"uiPort": 3000,
	"userDir": "./.dev",
	"logging": {
		"console": {
			"level": "debug",
			"metrics": false,
			"audit": false
		}
	}
}

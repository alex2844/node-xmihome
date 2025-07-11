const fs = require('fs');
const path = require('path');

const userDir = path.join(__dirname, '.dev');
const flowFile = path.join(userDir, 'flows.json');
const credFile = path.join(userDir, 'flows_cred.json');
const linkPath = path.join(__dirname, '.dev/lib/flows');
const examplesPath = path.join(__dirname, 'examples');
let credentialsData = {};

if (!fs.existsSync(path.dirname(linkPath)))
	fs.mkdirSync(path.dirname(linkPath), { recursive: true });
if (!fs.existsSync(linkPath))
	fs.symlinkSync(examplesPath, linkPath, 'dir');
if (fs.existsSync(credFile))
	credentialsData = JSON.parse(fs.readFileSync(credFile, 'utf8'));
if (!fs.existsSync(flowFile)) {
	const exampleFiles = fs.readdirSync(examplesPath).filter(file => file.endsWith('.json'));
	const allNodes = [];
	const tabUsage = new Map();
	for (const filename of exampleFiles) {
		const exampleContent = fs.readFileSync(path.join(examplesPath, filename), 'utf8');
		const exampleNodes = JSON.parse(exampleContent);
		const uniqueTabIdsInFile = new Set(exampleNodes.map(({ z }) => z).filter(Boolean));
		for (const tabId of uniqueTabIdsInFile) {
			if (!tabUsage.has(tabId))
				tabUsage.set(tabId, []);
			tabUsage.get(tabId).push(filename);
		}
	}
	const processedTabs = new Set();
	const conflictIdMap = new Map();
	let flowCounter = 0;
	for (const filename of exampleFiles) {
		const exampleContent = fs.readFileSync(path.join(examplesPath, filename), 'utf8');
		const exampleNodes = JSON.parse(exampleContent);
		for (const node of exampleNodes) {
			if (node.type === 'tab')
				continue;
			if (!node.z) {
				allNodes.push(node);
				continue;
			}
			const originalTabId = node.z;
			let finalTabId = originalTabId;
			if (tabUsage.get(originalTabId)?.length > 1) {
				if (!conflictIdMap.has(originalTabId))
					conflictIdMap.set(originalTabId, `flow_${Date.now()}_${flowCounter++}`);
				finalTabId = conflictIdMap.get(originalTabId);
			}
			if (!processedTabs.has(finalTabId)) {
				const originalTabNode = exampleNodes.find(({ type, id }) => (type === 'tab') && (id === originalTabId));
				const label = originalTabNode?.label || filename.replace('.json', '').replace(/-/g, ' ').replace(/^\w/, c => c.toUpperCase());
				const newTabNode = { id: finalTabId, type: 'tab', label };
				const credsForTab = credentialsData[originalTabId];
				if (credsForTab && (typeof credsForTab === 'object') && (Object.keys(credsForTab).length > 0))
					newTabNode.env = Object.keys(credsForTab).map(name => ({
						name,
						type: 'cred'
					}));
				allNodes.push(newTabNode);
				processedTabs.add(finalTabId);
			}
			node.z = finalTabId;
			allNodes.push(node);
		}
	}
	fs.writeFileSync(flowFile, JSON.stringify(allNodes, null, '\t'));
}

module.exports = {
	userDir, flowFile,
	uiPort: 3000,
	logging: {
		console: {
			level: 'debug',
			metrics: false,
			audit: false
		}
	},
	credentialSecret: false
};

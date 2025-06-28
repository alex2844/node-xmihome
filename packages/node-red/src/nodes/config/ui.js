/**
 * @import { EditorRED, EditorNodePropertiesDef, EditorNodeCredentials } from 'node-red'
 * @import { Config, Credentials } from './runtime.js'
 */
/** @typedef {Config & { name: string; _: object }} ConfigDef */

var /** @type {EditorRED} */ RED = window['RED'];

function validate() {
	const isUsername = !$('#node-config-input-username').val();
	const isPassword = !$('#node-config-input-password').val();
	return isUsername == isPassword;
};

RED.nodes.registerType('xmihome-config', {
	category: 'config',
	/** @type {EditorNodePropertiesDef<ConfigDef>} */ defaults: {
		name: { value: '' },
		debug: { value: false },
		connectionType: { value: 'auto' },
		_: {
			value: true,
			validate
		}
	},
	/** @type {EditorNodeCredentials<Credentials>} */ credentials: {
		username: { type: 'text' },
		password: { type: 'password' },
		country: { type: 'text' }
	},
	label: function () {
		return this.name || 'XiaomiMiHome';
	},
	oneditprepare: function () {
		const node = this;
		const credentialFields = $('#node-config-input-username, #node-config-input-password');
		const allFields = $('input, select, textarea').not(credentialFields);
		let validationTimeout;
		function updateValidation() {
			setTimeout(() => {
				if (validate()) {
					credentialFields.removeClass('input-error');
				} else {
					credentialFields.addClass('input-error');
				}
			}, 10);
			(/** @type {any} */ (node)).changed = true;
			RED.editor.validateNode(node);
		}
		credentialFields.on('blur', updateValidation);
		credentialFields.on('input', function () {
			clearTimeout(validationTimeout);
			validationTimeout = setTimeout(updateValidation, 200);
		});
		allFields.on('change input blur', function () {
			setTimeout(() => {
				if (!validate())
					credentialFields.addClass('input-error');
			}, 200);
		});
		updateValidation();
	},
	oneditsave: function () {
		$('#node-config-input-username, #node-config-input-password').removeClass('input-error');
	},
	oneditcancel: function () {
		$('#node-config-input-username, #node-config-input-password').removeClass('input-error');
	}
});

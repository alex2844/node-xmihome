/** @import { EditorRED, EditorNodePropertiesDef, EditorNodeCredentials, EditorNodeCredential, EditorNodeInstance } from 'node-red' */
/** @import { Credentials } from 'xmihome' */
/** @import { Config } from './runtime.js' */
/** @typedef {Config & { name: string; credentialsValid: boolean }} ConfigDef */
/** @typedef {EditorNodeCredential & { validate: () => boolean }} CredentialDef */

let /** @type {EditorRED} */ RED = window['RED'];
let /** @type {EditorNodeInstance} */ node = null;

function validateCredentials() {
	const authSourceEl = $('#node-config-input-authSource');
	if (authSourceEl.length > 0) {
		const isFile = authSourceEl.val() === 'file';
		if (isFile)
			return !!$('#node-config-input-credentialsFile').val();
		const isUsername = !!$('#node-config-input-username').val();
		const isPassword = !!$('#node-config-input-password').val();
		const hasToken = !!$('#node-config-input-serviceToken').val();
		if (!isUsername && !isPassword && !hasToken)
			return true;
		return isUsername && (isPassword || hasToken);
	}
	return (this && typeof this.credentialsValid === 'boolean') ? this.credentialsValid : true;
};

function validateUsername() {
	const authSourceEl = $('#node-config-input-authSource');
	if (authSourceEl.length > 0 && authSourceEl.val() === 'file')
		return true;
	const isUsername = !!$('#node-config-input-username').val();
	const isPassword = !!$('#node-config-input-password').val();
	const hasToken = !!$('#node-config-input-serviceToken').val();
	if (!isUsername && !isPassword && !hasToken)
		return true;
	return isUsername;
};

function validatePassword() {
	const authSourceEl = $('#node-config-input-authSource');
	if (authSourceEl.length > 0 && authSourceEl.val() === 'file')
		return true;
	const isUsername = !!$('#node-config-input-username').val();
	const isPassword = !!$('#node-config-input-password').val();
	const hasToken = !!$('#node-config-input-serviceToken').val();
	if (!isUsername && !isPassword && !hasToken)
		return true;
	return isPassword || hasToken;
};

function updateLoginButtonState() {
	const loginButton = $('#node-config-button-login');
	const isUsername = !!$('#node-config-input-username').val();
	const isPassword = !!$('#node-config-input-password').val();
	const hasCredentials = isUsername && isPassword;
	if (hasCredentials)
		loginButton.prop('disabled', false).removeClass('red-ui-button-disabled');
	else
		loginButton.prop('disabled', true).addClass('red-ui-button-disabled');
};

function disableDoneButton() {
	const doneButton = $('#node-config-dialog-ok');
	doneButton.prop('disabled', true).addClass('disabled');
};

function enableDoneButton() {
	const doneButton = $('#node-config-dialog-ok');
	doneButton.prop('disabled', false).removeClass('disabled');
};

function toggleAuthSource() {
	const manualGroup = $('#auth-manual-group');
	const fileGroup = $('#auth-file-group');
	if ($(this).val() === 'file') {
		manualGroup.hide();
		fileGroup.show();
	} else {
		manualGroup.show();
		fileGroup.hide();
		$('#node-config-input-credentialsFile').val('');
	}
};

RED.nodes.registerType('xmihome-config', {
	category: 'config',
	/** @type {EditorNodePropertiesDef<ConfigDef>} */ defaults: {
		name: { value: '' },
		credentialsFile: {
			value: '',
			validate: function () {
				const authSourceEl = $('#node-config-input-authSource');
				if (authSourceEl.length > 0 && authSourceEl.val() === 'file')
					return !!$('#node-config-input-credentialsFile').val();
				return true;
			}
		},
		debug: { value: false },
		connectionType: { value: 'auto' },
		credentialsValid: {
			value: true,
			validate: validateCredentials
		}
	},
	/** @type {EditorNodeCredentials<Credentials>} */ credentials: {
		/** @type {CredentialDef} */ username: {
			type: 'text',
			validate: validateUsername
		},
		/** @type {CredentialDef} */ password: {
			type: 'password',
			validate: validatePassword
		},
		country: { type: 'text' },
		deviceId: { type: 'text' },
		userId: { type: 'text' },
		ssecurity: { type: 'text' },
		serviceToken: { type: 'text' },
		passToken: { type: 'text' }
	},
	label: function () {
		return this.name || 'XiaomiMiHome';
	},
	oneditsave: function () {
		const authSource = $('#node-config-input-authSource').val();
		if (authSource === 'file')
			this.credentialsValid = !!$('#node-config-input-credentialsFile').val();
		else {
			const isUsername = !!$('#node-config-input-username').val();
			const isPassword = !!$('#node-config-input-password').val();
			const hasToken = !!$('#node-config-input-serviceToken').val();
			if (!isUsername && !isPassword && !hasToken)
				this.credentialsValid = true;
			else
				this.credentialsValid = isUsername && (isPassword || hasToken);
		}
	},
	oneditprepare: function () {
		node = this;
		const loginButton = $('#node-config-button-login');
		const credsFile = $('#node-config-input-credentialsFile');

		function updateAuthStatus() {
			const hasToken = !!$('#node-config-input-serviceToken').val();
			const statusRow = $('#node-config-auth-status-row');
			const statusText = $('#node-config-auth-status');
			const isManual = $('#node-config-input-authSource').val() === 'manual';
			if (!isManual) {
				statusRow.hide();
				return;
			}
			const hasUsername = !!$('#node-config-input-username').val();
			if (!hasToken && !hasUsername) {
				statusRow.hide();
				return;
			}
			statusRow.show();
			if (hasToken)
				statusText.html('<span style="color: var(--red-ui-text-color-success, #3c763d); font-weight: bold;"><i class="fa fa-check-circle"></i> ' + node._('config.label.authStatusAuthorized') + '</span>');
			else
				statusText.html('<span style="color: var(--red-ui-text-color-error, #a94442);"><i class="fa fa-times-circle"></i> ' + node._('config.label.authStatusUnauthorized') + '</span>');
		};

		let currentUsername = /** @type {string} */ ($('#node-config-input-username').val());
		$('#node-config-input-username, #node-config-input-password').on('input keyup change', updateLoginButtonState);
		$('#node-config-input-username').on('input', function () {
			const newUsername = /** @type {string} */ ($(this).val());
			if (newUsername !== currentUsername) {
				currentUsername = newUsername;
				if ($('#node-config-input-password').val() === '__PWRD__')
					$('#node-config-input-password').val('');
				$('#node-config-input-deviceId, #node-config-input-userId, #node-config-input-ssecurity, #node-config-input-serviceToken, #node-config-input-passToken').val('');
				updateLoginButtonState();
				updateAuthStatus();
			}
		});
		$('#node-config-input-authSource').on('change', function () {
			toggleAuthSource.call(this);
			updateAuthStatus();
			$('#node-config-input-username, #node-config-input-password, #node-config-input-credentialsFile').trigger('change');
		}).val(credsFile.val() ? 'file' : 'manual').trigger('change');

		function performAuthRequest(/** @type {string} */ url, /** @type {any} */ payload) {
			disableDoneButton();
			$.ajax({
				url: url,
				type: 'POST',
				contentType: 'application/json',
				data: JSON.stringify(payload),
				timeout: 6 * 60 * 1000,
				success: function (data) {
					if (data.status === 'success') {
						if (data.tokens) {
							$('#node-config-input-deviceId').val(data.tokens.deviceId || '');
							$('#node-config-input-userId').val(data.tokens.userId || '');
							$('#node-config-input-ssecurity').val(data.tokens.ssecurity || '');
							$('#node-config-input-serviceToken').val(data.tokens.serviceToken || '');
							$('#node-config-input-passToken').val(data.tokens.passToken || '');
						}
						currentUsername = /** @type {string} */ ($('#node-config-input-username').val());
						updateAuthStatus();
						$('#node-config-input-password, #node-config-input-username').trigger('change');
						RED.nodes.dirty(true);
						RED.notify(node._('config.dialog.loginSuccess'), 'success');
						enableDoneButton();
					} else if (data.status === '2fa_required')
						open2FADialog(data);
					else if (data.status === 'captcha_required')
						openCaptchaDialog(data);
				},
				error: function (jqXHR) {
					const message = jqXHR.responseJSON?.error || jqXHR.statusText;
					console.error('[Xiaomi Login Error]:', message);
					alert(`${node._('config.dialog.errorLoginFailed')}:\n${JSON.stringify(message)}`);
					enableDoneButton();
				},
				complete: function () {
					loginButton.prop('disabled', false).removeClass('red-ui-button-disabled');
				}
			});
		}

		function open2FADialog({ stateToken }) {
			const dialogTemplate = $('#xmihome-2fa-dialog-template').html();
			const dialog = $('<div id="xmihome-2fa-dialog-container"></div>').html(dialogTemplate);
			dialog.find('[data-i18n]').each(function () {
				$(this).text(node._($(this).attr('data-i18n')));
			});
			dialog.find('#xmihome-2fa-ticket-input').on('keydown', function (e) {
				if (e.key === 'Enter') {
					e.preventDefault();
					dialog.parent().find('.ui-dialog-buttonpane button.primary').trigger('click');
				}
			});
			(/** @type {any} */ (dialog)).dialog({
				title: node._('config.dialog.2faTitle'),
				modal: true,
				width: 560,
				buttons: [{
					text: node._('config.dialog.buttonSubmit'),
					class: 'primary',
					click: function () {
						const ticket = $('#xmihome-2fa-ticket-input').val();
						if (ticket) {
							$(this).siblings('.ui-dialog-buttonpane').find('button').prop('disabled', true);
							(/** @type {any} */ ($(this))).dialog("close");
							performAuthRequest('xmihome/auth/submit_ticket', { stateToken, ticket, nodeId: node.id });
						}
					}
				}, {
					text: node._('config.dialog.buttonCancel'),
					click: function () {
						(/** @type {any} */ ($(this))).dialog("close");
					}
				}],
				close: function () {
					dialog.remove();
					enableDoneButton();
				}
			});
		}

		function openCaptchaDialog({ stateToken, imageB64 }) {
			const dialogTemplate = $('#xmihome-captcha-dialog-template').html();
			const dialog = $('<div id="xmihome-captcha-dialog-container"></div>').html(dialogTemplate);
			dialog.find('[data-i18n]').each(function () {
				$(this).text(node._($(this).attr('data-i18n')));
			});
			dialog.find('#xmihome-captcha-image').attr('src', imageB64);
			dialog.find('#xmihome-captcha-input').on('keydown', function (e) {
				if (e.key === 'Enter') {
					e.preventDefault();
					dialog.parent().find('.ui-dialog-buttonpane button.primary').trigger('click');
				}
			});
			(/** @type {any} */ (dialog)).dialog({
				title: node._('config.dialog.captchaTitle'),
				modal: true,
				width: 450,
				buttons: [{
					text: node._('config.dialog.buttonSubmit'),
					class: 'primary',
					click: function () {
						const captCode = $('#xmihome-captcha-input').val();
						if (captCode) {
							$(this).siblings('.ui-dialog-buttonpane').find('button').prop('disabled', true);
							(/** @type {any} */ ($(this))).dialog("close");
							performAuthRequest('xmihome/auth/submit_captcha', { stateToken, captCode, nodeId: node.id });
						}
					}
				}, {
					text: node._('config.dialog.buttonCancel'),
					click: function () {
						(/** @type {any} */ ($(this))).dialog("close");
					}
				}],
				close: function () {
					dialog.find('#xmihome-captcha-image').attr('src', '');
					dialog.remove();
					enableDoneButton();
				}
			});
		}

		loginButton.on('click', function (e) {
			e.preventDefault();
			const username = $('#node-config-input-username').val();
			const password = $('#node-config-input-password').val();
			const country = $('#node-config-input-country').val();
			const debug = $('#node-config-input-debug').is(':checked');
			loginButton.prop('disabled', true).addClass('red-ui-button-disabled');
			performAuthRequest('xmihome/auth', { username, password, country, nodeId: node.id, debug });
		});

		updateLoginButtonState();
		updateAuthStatus();
	}
});

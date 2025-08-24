/** @import { EditorRED, EditorNodePropertiesDef, EditorNodeCredentials } from 'node-red' */
/** @import { Credentials } from 'xmihome' */
/** @import { Config } from './runtime.js' */
/** @typedef {Config & { name: string; credentialsValid: boolean }} ConfigDef */

var /** @type {EditorRED} */ RED = window['RED'];

function validate() {
	const isUsername = !!$('#node-config-input-username').val();
	const isPassword = !!$('#node-config-input-password').val();
	return isUsername == isPassword;
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

RED.nodes.registerType('xmihome-config', {
	category: 'config',
	/** @type {EditorNodePropertiesDef<ConfigDef>} */ defaults: {
		name: { value: '' },
		debug: { value: false },
		connectionType: { value: 'auto' },
		// Фиктивное поле для валидации credentials
		credentialsValid: {
			value: true,
			validate
		}
	},
	/** @type {EditorNodeCredentials<Credentials>} */ credentials: {
		username: { 
			type: 'text',
			// @ts-ignore
			validate
		},
		password: { 
			type: 'password',
			// @ts-ignore
			validate
		},
		country: { type: 'text' },
		userId: { type: 'text' },
		ssecurity: { type: 'text' },
		serviceToken: { type: 'text' }
	},
	label: function () {
		return this.name || 'XiaomiMiHome';
	},
	oneditprepare: function () {
		const node = this;
		const loginButton = $('#node-config-button-login');
		$('#node-config-input-username, #node-config-input-password').on('input keyup change', updateLoginButtonState);
		loginButton.on('click', function (e) {
			e.preventDefault();
			const username = $('#node-config-input-username').val();
			const password = $('#node-config-input-password').val();
			const country = $('#node-config-input-country').val();
			loginButton.prop('disabled', true).addClass('red-ui-button-disabled');
			disableDoneButton();
			$.ajax({
				url: `xmihome/${node.id}/auth`,
				type: 'POST',
				contentType: 'application/json',
				data: JSON.stringify({ username, password, country }),
				timeout: 6 * 60 * 1000,
				success: function (data) {
					if (data.status === 'success')
						RED.nodes.dirty(true);
					else if (data.status === '2fa_required') {
						const dialogTemplate = $('#xmihome-2fa-dialog-template').html();
						const dialog = $('<div id="xmihome-2fa-dialog-container"></div>').html(dialogTemplate);
						dialog.find('[data-i18n]').each(function () {
							$(this).text(node._($(this).attr('data-i18n')));
						});
						dialog.find('.xmihome-2fa-url').attr('href', data.notificationUrl).text(data.notificationUrl);
						(/** @type {any} */ (dialog)).dialog({
							title: node._('config.dialog.title'),
							modal: true,
							width: 560,
							buttons: [{
								text: node._('config.dialog.buttonSubmit'),
								class: 'primary',
								click: function () {
									const ticket = $('#xmihome-2fa-ticket-input').val();
									if (ticket) {
										disableDoneButton();
										$.ajax({
											url: `xmihome/${node.id}/auth/submit_ticket`,
											type: 'POST',
											contentType: 'application/json',
											data: JSON.stringify({ stateToken: data.stateToken, ticket: ticket }),
											success: function(ticketData) {
												enableDoneButton();
											},
											error: function (jqXHR) {
												enableDoneButton();
												console.error('Submit ticket error:', jqXHR.responseJSON?.error);
											}
										});
										(/** @type {any} */ ($(this))).dialog("close");
									}
								}
							}, {
								text: node._('config.dialog.buttonCancel'),
								click: function () {
									(/** @type {any} */ ($(this))).dialog("close");
									enableDoneButton();
								}
							}],
							close: function () {
								dialog.remove();
								enableDoneButton();
							}
						});
					}
				},
				error: function (jqXHR) {
					const message = jqXHR.responseJSON?.error || jqXHR.statusText;
					alert(`${node._('config.dialog.errorLoginFailed')}:\n${JSON.stringify(message)}`);
				},
				complete: function () {
					loginButton.prop('disabled', false).removeClass('red-ui-button-disabled');
				}
			});
		});
		updateLoginButtonState();
	}
});

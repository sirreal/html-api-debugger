<?php
namespace HTML_API_Debugger\XMLRPC;

const DEFAULT_REQUEST = <<<'XML'
<?xml version="1.0"?>
<methodCall>
	<methodName>demo.sayHello</methodName>
	<params></params>
</methodCall>
XML;

/** Print the XML-RPC debugger page. */
function print_page() {
	?>
<form id="xmlrpc-form" class="html-api-debugger-container xmlrpc-debugger">
	<p>
		<label for="xmlrpc-endpoint">Endpoint</label>
		<input id="xmlrpc-endpoint" type="url" class="regular-text code" value="<?php echo esc_url( site_url( 'xmlrpc.php' ) ); ?>">
		<button type="submit" class="button button-primary">Send</button>
	</p>
	<div class="html-api-debugger--grid">
		<div>
			<h2>Request body</h2>
			<textarea
				id="xmlrpc-request"
				autocapitalize="off"
				autocomplete="off"
				spellcheck="false"
				wrap="off"
			><?php echo "\n" . esc_textarea( DEFAULT_REQUEST ); ?></textarea>
		</div>
		<div>
			<h2>Response <a id="xmlrpc-response-link" target="_blank" hidden>Open in new tab</a></h2>
			<pre id="xmlrpc-error" class="error-holder" hidden></pre>
			<ul id="xmlrpc-response"></ul>
		</div>
	</div>
	<pre id="xmlrpc-status"></pre>
</form>
	<?php
}

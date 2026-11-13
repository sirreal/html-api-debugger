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
	$default_endpoint = site_url( 'xmlrpc.php' );
	$endpoint         = $default_endpoint;
	$request          = DEFAULT_REQUEST;
	// phpcs:disable WordPress.Security.NonceVerification.Recommended
	if ( isset( $_GET['endpoint'] ) && \is_string( $_GET['endpoint'] ) ) {
		$endpoint = stripslashes( $_GET['endpoint'] );
	}
	if ( isset( $_GET['request'] ) && \is_string( $_GET['request'] ) ) {
		$request = stripslashes( $_GET['request'] );
	}
	// phpcs:enable WordPress.Security.NonceVerification.Recommended
	?>
<form id="xmlrpc-form" class="html-api-debugger-container xmlrpc-debugger">
	<p>
		<label for="xmlrpc-endpoint">Endpoint</label>
		<input id="xmlrpc-endpoint" type="url" class="regular-text code" value="<?php echo esc_attr( $endpoint ); ?>" data-default="<?php echo esc_attr( $default_endpoint ); ?>">
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
			><?php echo "\n" . esc_textarea( str_replace( "\0", '', $request ) ); ?></textarea>
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

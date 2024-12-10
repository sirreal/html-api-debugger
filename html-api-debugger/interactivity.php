<?php
namespace HTML_API_Debugger\Interactivity;

/**
 * Generate the WP Admin page HTML.
 *
 * @param string $html The input html.
 * @param array  $options The input html.
 * @return The page HTML as rendered by the Interactivity API. This is intended to be printed directly to the page with no additional escaping.
 */
function generate_page( string $html, array $options ): string {
	// phpcs:enable WordPress.Security.NonceVerification.Recommended
	$htmlapi_response = \HTML_API_Debugger\prepare_html_result_object( $html, $options );

	wp_interactivity_config(
		\HTML_API_Debugger\SLUG,
		array(
			'restEndpoint' => rest_url( 'html-api-debugger/v1/htmlapi' ),
			'nonce' => wp_create_nonce( 'wp_rest' ),
		)
	);
	wp_interactivity_state(
		\HTML_API_Debugger\SLUG,
		array(
			'DOM' => array(
				'renderingMode' => '',
				'documentTitle' => '',
				'doctypeName' => '',
				'doctypeSystemId' => '',
				'doctypePublicId' => '',
			),
			'hasMutatedDom' => false,
			'html' => $html,
			'htmlapiResponse' => $htmlapi_response,

			'showClosers' => false,
			'showInvisible' => false,
			'showVirtual' => false,
			'contextHTML' => $options['context_html'] ?? '',
			'selector' => $options['selector'] ?? '',

			'hoverInfo' => 'breadcrumbs',
			'hoverBreadcrumbs' => true,
			'hoverInsertion' => false,
			'checkingForPRPlaygroundLink' => false,

			'htmlApiDocumentTitle' => $htmlapi_response['result']['documentTitle'] ?? null,
			'htmlApiDoctypeName' => $htmlapi_response['result']['doctypeName'] ?? null,
			'htmlApiDoctypePublicId' => $htmlapi_response['result']['doctypePublicId'] ?? null,
			'htmlApiDoctypeSytemId' => $htmlapi_response['result']['doctypeSystemId'] ?? null,
			'treeWarnings' => $htmlapi_response['result']['warnings'] ?? array(),
			'normalizedHtml' => $htmlapi_response['normalizedHtml'] ?? '',

			'playbackLength' => isset( $htmlapi_response['result']['playback'] )
				? count( $htmlapi_response['result']['playback'] )
				: 0,
		)
	);
	ob_start();
	?>
<div
	data-wp-interactive="<?php echo esc_attr( \HTML_API_Debugger\SLUG ); ?>"
	data-wp-watch--main="watch"
	data-wp-watch--url="watchURL"
	data-wp-init="run"
	class="html-api-debugger-container html-api-debugger--grid"
>
	<div data-wp-bind--hidden="!state.htmlapiResponse.supports.create_fragment_advanced" class="full-width">
		<label>Context in which input HTML finds itself
			<textarea
				class="context-html"
				placeholder="Provide a fragment context, for example:&#x0A;<!DOCTYPE html><body>"
				title="Leave blank to parse a full document."
				rows="2"
				data-wp-on-async--input="handleContextHtmlInput"
			><?php echo "\n" . esc_textarea( str_replace( "\0", '', $options['context_html'] ?? '' ) ); ?></textarea>
		</label>
	</div>
	<div>
		<h2>Input HTML</h2>
		<textarea
			id='input_html'
			autocapitalize="off"
			autocomplete="off"
			spellcheck="false"
			wrap="off"
			data-wp-on-async--input="handleInput"
		><?php echo "\n" . esc_textarea( str_replace( "\0", '', $html ) ); ?></textarea>
	</div>
	<div class="iframe-container">
		<h2>Rendered output</h2>
		<iframe
			src="about:blank"
			id="rendered_iframe"
			referrerpolicy="no-referrer"
			sandbox="allow-forms allow-modals allow-popups allow-scripts allow-same-origin"></iframe>
	</div>
	<details class="full-width">
		<summary>HTML API Normalized HTML</summary>
		<pre class="html-text" data-wp-text="state.normalizedHtml"></pre>
	</details>
	<details class="full-width">
		<summary>Document info</summary>

		<div class="html-api-debugger--grid">
			<div>
				Rendering mode:&nbsp;<code data-wp-text="state.htmlapiResponse.result.compatMode"></code><br>
				Document title:&nbsp;<code data-wp-text="state.htmlApiDocumentTitle"></code><br>
				Doctype name:&nbsp;<code data-wp-text="state.htmlApiDoctypeName"></code><br>
				Doctype publicId:&nbsp;<code data-wp-text="state.htmlApiDoctypePublicId"></code><br>
				Doctype systemId:&nbsp;<code data-wp-text="state.htmlApiDoctypeSystemId"></code><br>
				Context node:&nbsp;<code data-wp-text="state.htmlapiResponse.result.contextNode"></code>
			</div>
			<div>
				Rendering mode:&nbsp;<code data-wp-text="state.DOM.renderingMode"></code><br>
				Document title:&nbsp;<code data-wp-text="state.DOM.documentTitle"></code><br>
				Doctype name:&nbsp;<code data-wp-text="state.DOM.doctypeName"></code><br>
				Doctype publicId:&nbsp;<code data-wp-text="state.DOM.doctypePublicId"></code><br>
				Doctype systemId:&nbsp;<code data-wp-text="state.DOM.doctypeSystemId"></code><br>
				Context node:&nbsp;<code data-wp-text="state.DOM.contextNode"></code>
			</div>
		</div>
	</details>
	<div class="full-width html-api-debugger--grid">
		<div>
			<div class="heading-and-button">
				<h2>Interpreted by HTML API</h2>
				<button type="button" data-wp-on-async--click="handleCopyTreeClick" name="tree__html-api">Copy tree 📋</button>
			</div>
			<div
				data-wp-on-async--mouseover="handleSpanOver"
				data-wp-on-async--mouseleave="clearSpan"
			>
				<pre class="error-holder" data-wp-bind--hidden="!state.htmlapiResponse.error" data-wp-text="state.htmlapiResponse.error"></pre>
				<div data-wp-bind--hidden="state.htmlapiResponse.error">
					<ul id="html_api_result_holder" data-wp-ignore></ul>
				</div>
			</div>
		</div>
		<div>
			<div class="heading-and-button">
				<h2>Interpreted from DOM</h2>
				<button type="button" data-wp-on-async--click="handleCopyTreeClick" name="tree__dom">Copy tree 📋</button>
			</div>
			<div data-wp-class--mutated="state.hasMutatedDom"><ul id="dom_tree" data-wp-ignore></ul></div>
		</div>
	</div>

	<div class="full-width">
		<div>
			<div>
				<label>Show closers <input type="checkbox" data-wp-bind--checked="state.showClosers" data-wp-on-async--input="handleShowClosersClick"></label>
				<label>Show invisible <input type="checkbox" data-wp-bind--checked="state.showInvisible" data-wp-on-async--input="handleShowInvisibleClick"></label>
				<span><label>Show virtual <input type="checkbox" data-wp-bind--checked="state.showVirtual" data-wp-on-async--input="handleShowVirtualClick"></label></span>
				<div data-wp-bind--hidden="!state.htmlapiResponse.supports.selectors">
					<label>CSS Selectors <textarea placeholder="CSS selector: .my-class" data-wp-on-async--input="handleSelectorChange"><?php echo "\n" . esc_textarea( str_replace( "\0", '', $options['selector'] ?? '' ) ); ?></textarea></label>
				</div>
			</div>
			<div>
				<label>
					Hover information
					<select data-wp-on-async--change="hoverInfoChange">
						<option data-wp-bind--selected="state.hoverBreadcrumbs" value="breadcrumbs">(depth) Breadcrumbs…</option>
						<option data-wp-bind--selected="state.hoverInsertion" value="insertionMode">Insertion mode</option>
					</select>
				</label>
			</div>
		</div>

		<div data-wp-bind--hidden="!state.treeWarnings.length">
			<template data-wp-each="state.treeWarnings">
				<p data-wp-text="context.item" class="error-holder"></p>
			</template>
		</div>
		<p data-wp-bind--hidden="!state.selectorErrorMessage" data-wp-text="state.selectorErrorMessage" class="error-holder"></p>

		<div>
			<h2>Processed HTML</h2>
			<div data-wp-bind--hidden="!state.htmlapiResponse.result.playback">
				<label>
					Move the slider to replay token processing:
					<input
						type="range"
						min="2"
						style="width:100%"
						data-wp-bind--max="state.playbackLength"
						data-wp-bind--value="state.playbackLength"
						data-wp-on--input="handlePlaybackChange"
					>
				</label>
			</div>
			<pre class="html-text" id="processed-html" data-wp-ignore><?php echo esc_html( $html ); ?></pre>
		</div>

		<p>
			<label>
				<select id="htmlapi-wp-version">
					<option value="latest">latest</option>
					<option value="nightly">nightly</option>
					<option value="beta">beta</option>
					<option value="6.7">6.7</option>
				</select>
			</label>
			<button data-wp-on-async--click="handleCopyClick" type="button">Copy shareable playground link</button><br>
		</p>
		<p>
			<label>
				<code>WordPress/develop</code> PR number:
				<input type="number" min="1" data-wp-on-async--input="handleCopyCorePrInput">
			</label>
			<label>
				<code>WordPress/gutenberg</code> PR number:
				<input type="number" min="1" data-wp-on-async--input="handleCopyGutenbergPrInput">
			</label>
			<button data-wp-on-async--click="handleCopyPrClick">Copy shareable playground link to PR</button>
			<span data-wp-bind--hidden="!state.previewCoreLink">
				<a
					data-wp-bind--href="state.previewCoreLink.href"
					data-wp-text="state.previewCoreLink.text"
					rel="noopener noreferrer"
				></a>
			</span>
			<span data-wp-bind--hidden="!state.previewGutenbergLink">
				<a
					data-wp-bind--href="state.previewGutenbergLink.href"
					data-wp-text="state.previewGutenbergLink.text"
					rel="noopener noreferrer"
				></a>
			</span>
		</p>
		<div>
			<details>
				<summary>debug response</summary>
				<pre data-wp-text="state.formattedHtmlapiResponse"></pre>
			</details>
		</div>
	</div>
</div>
	<?php
	return wp_interactivity_process_directives( ob_get_clean() );
}

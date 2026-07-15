<?php
/**
 * Legacy URL migration helpers.
 *
 * @package HtmlApiDebugger
 */

namespace HTML_API_Debugger;

/**
 * Convert a WordPress-slashed legacy query to canonical v1 parameters.
 *
 * Canonical-only fields always suppress legacy interpretation. The caller can
 * then render a visible canonical-format error instead of silently falling
 * back to the old string transport.
 *
 * @param mixed $query WordPress-slashed query parameters.
 * @return array<string, string>|null Canonical transport parameters, or null when no migration applies.
 * @throws \InvalidArgumentException When a recognized legacy value is not a valid string.
 */
function get_legacy_redirect_params( $query ): ?array {
	if ( ! is_array( $query ) ) {
		throw new \InvalidArgumentException( 'Invalid legacy URL.' );
	}

	foreach ( array( 'format', 'html64', 'context64', 'opts' ) as $canonical_only_key ) {
		if ( array_key_exists( $canonical_only_key, $query ) ) {
			return null;
		}
	}

	$legacy_keys = array( 'html', 'contextHTML', 'selector', 'html-opts' );
	$has_legacy  = false;
	foreach ( $legacy_keys as $key ) {
		if ( ! array_key_exists( $key, $query ) ) {
			continue;
		}
		$has_legacy = true;
		if ( ! is_string( $query[ $key ] ) ) {
			throw new \InvalidArgumentException( 'Invalid legacy URL.' );
		}
	}

	if ( ! $has_legacy ) {
		return null;
	}

	$html = array_key_exists( 'html', $query )
		? \wp_unslash( $query['html'] )
		: '';
	$context_html = array_key_exists( 'contextHTML', $query )
		? \wp_unslash( $query['contextHTML'] )
		: '';
	$selector = array_key_exists( 'selector', $query )
		? \wp_unslash( $query['selector'] )
		: '';
	$legacy_opts = array_key_exists( 'html-opts', $query )
		? \wp_unslash( $query['html-opts'] )
		: '';

	if ( 1 !== preg_match( '//u', $selector ) ) {
		throw new \InvalidArgumentException( 'Invalid legacy URL.' );
	}

	return array(
		'format' => 'v1',
		'html64' => encode_base64url( $html ),
		'context64' => encode_base64url( $context_html ),
		'selector' => $selector,
		'opts' => normalize_legacy_url_options( $legacy_opts ),
	);
}

/**
 * Normalize old option flags to the unique canonical order.
 *
 * Legacy parsing applied flags from left to right and let the final case for
 * each option win. Unknown flags were ignored.
 *
 * @param string $legacy_opts Legacy html-opts value.
 * @return string Canonical C/c, I/i, V/v flags.
 */
function normalize_legacy_url_options( string $legacy_opts ): string {
	$states = array(
		'C' => null,
		'I' => null,
		'V' => null,
	);

	for ( $offset = 0; $offset < strlen( $legacy_opts ); ++$offset ) {
		$flag  = $legacy_opts[ $offset ];
		$upper = strtoupper( $flag );
		if ( array_key_exists( $upper, $states ) ) {
			$states[ $upper ] = $flag;
		}
	}

	return implode( '', array_filter( $states, 'is_string' ) );
}

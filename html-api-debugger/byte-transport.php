<?php
/**
 * Byte-safe transport helpers.
 *
 * @package HtmlApiDebugger
 */

namespace HTML_API_Debugger;

/**
 * Encode bytes as unpadded base64url.
 *
 * @param string $bytes Bytes to encode.
 * @return string Canonical base64url.
 */
function encode_base64url( string $bytes ): string {
	return rtrim( strtr( base64_encode( $bytes ), '+/', '-_' ), '=' );
}

/**
 * Decode canonical unpadded base64url.
 *
 * @param string $encoded Canonical base64url.
 * @return string Decoded bytes.
 * @throws \InvalidArgumentException When the input is not canonical base64url.
 */
function decode_base64url( string $encoded ): string {
	if ( 1 !== preg_match( '/\A[A-Za-z0-9_-]*\z/D', $encoded ) || 1 === strlen( $encoded ) % 4 ) {
		throw new \InvalidArgumentException( 'Expected canonical unpadded base64url.' );
	}

	$padding = ( 4 - strlen( $encoded ) % 4 ) % 4;
	$decoded = base64_decode(
		strtr( $encoded, '-_', '+/' ) . str_repeat( '=', $padding ),
		true
	);

	if ( false === $decoded || encode_base64url( $decoded ) !== $encoded ) {
		throw new \InvalidArgumentException( 'Expected canonical unpadded base64url.' );
	}

	return $decoded;
}

/**
 * Recursively replace string values with byte envelopes.
 *
 * Array keys and public object-property names are protocol keys and remain
 * unchanged. Objects become arrays so their public values can be traversed
 * without mutating the source object.
 *
 * @param mixed $value Value to transport.
 * @return mixed Value with every string replaced by a byte envelope.
 */
function envelope_response_strings( $value ) {
	if ( is_string( $value ) ) {
		return array( '__bytesBase64url' => encode_base64url( $value ) );
	}

	if ( is_object( $value ) ) {
		$value = get_object_vars( $value );
	}

	if ( is_array( $value ) ) {
		foreach ( $value as $key => $item ) {
			$value[ $key ] = envelope_response_strings( $item );
		}
	}

	return $value;
}

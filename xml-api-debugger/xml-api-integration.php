<?php

namespace XML_API_Debugger\XML_API_Integration;

use Exception;
use ReflectionClass;
use ReflectionMethod;
use ReflectionProperty;
use WP_XML_Processor;
use WP_XML_Tag_Processor;

const NODE_TYPE_ELEMENT                = 1;
const NODE_TYPE_ATTRIBUTE              = 2;
const NODE_TYPE_TEXT                   = 3;
const NODE_TYPE_CDATA_SECTION          = 4;
const NODE_TYPE_ENTITY_REFERENCE       = 5;
const NODE_TYPE_ENTITY                 = 6;
const NODE_TYPE_PROCESSING_INSTRUCTION = 7;
const NODE_TYPE_COMMENT                = 8;
const NODE_TYPE_DOCUMENT               = 9;
const NODE_TYPE_DOCUMENT_TYPE          = 10;
const NODE_TYPE_DOCUMENT_FRAGMENT      = 11;
const NODE_TYPE_NOTATION               = 12;

function get_supports(): array {
	$xml_processor_rc       = new ReflectionClass( WP_XML_Processor::class );

	return array(
	);
}

function get_tree( string $xml, array $options ): array {
	$current_bookmark_name = __NAMESPACE__ . '-bookmark';

	$processor_bytes_already_parsed = new ReflectionProperty( WP_XML_Tag_Processor::class, 'bytes_already_parsed' );
	$processor_bytes_already_parsed->setAccessible( true );

	$processor_bookmarks = new ReflectionProperty( WP_XML_Tag_Processor::class, 'bookmarks' );
	$processor_bookmarks->setAccessible( true );

	$processor_parser_context = new ReflectionProperty( WP_XML_Processor::class, 'parser_context' );
	$processor_parser_context->setAccessible( true );

	$processor_parser_state = new ReflectionProperty( WP_XML_Tag_Processor::class, 'parser_state' );
	$processor_parser_state->setAccessible( true );

	$processor = new WP_XML_Processor( $xml );

	$doctype_value = 'xml';

	$rc = new ReflectionClass( WP_XML_Processor::class );

	$is_virtual = function () {
		return null;
	};

	if ( $rc->hasMethod( 'is_virtual' ) ) {
		$processor_is_virtual = new ReflectionMethod( WP_XML_Processor::class, 'is_virtual' );
		$processor_is_virtual->setAccessible( true );
		$is_virtual = function () use ( $processor_is_virtual, $processor ) {
			return $processor_is_virtual->invoke( $processor );
		};
	}

	$get_current_depth = method_exists( WP_XML_Processor::class, 'get_current_depth' )
		? function () use ( $processor ): int {
			return $processor->get_current_depth();
		}
		: function () use ( $processor ): int {
			return count( $processor->get_breadcrumbs() );
		};

	$get_tag_name = function () use ( $processor ): string {
		return $processor->get_tag();
	};

	$get_attribute_name = function ( string $attribute_name ): string {
		return $attribute_name;
	};

	if ( null === $processor ) {
		throw new Exception( 'could not process xml' );
	}

	$tree = array(
		'nodeType'   => NODE_TYPE_DOCUMENT,
		'nodeName'   => '#document',
		'childNodes' => array(),
	);

	$cursor = array( 0 );


	while ( $processor->next_token() ) {
		$processor->set_bookmark($current_bookmark_name);
		if ( $processor->get_last_error() !== null ) {
			break;
		}

		if ( ( count( $cursor ) + 1 ) > $get_current_depth() ) {
			array_pop( $cursor );
		}
		$current = &$tree;
		foreach ( $cursor as $path ) {
			$current = &$current['childNodes'][ $path ];
		}

		$token_type = $processor->get_token_type();

		switch ( $token_type ) {
			case '#xml-declaration':
				$current['childNodes'][] = array(
					'nodeType' => NODE_TYPE_PROCESSING_INSTRUCTION,
					'nodeName' => $processor->get_modifiable_text(),
					'_span'    => $processor_bookmarks->getValue( $processor )[ "_{$current_bookmark_name}" ],
					'_bc'      => $processor->get_breadcrumbs(),
					'_depth'   => $get_current_depth(),
				);
				break;

			case '#processing-instructions':
				$current['childNodes'][] = array(
					'nodeType' => NODE_TYPE_PROCESSING_INSTRUCTION,
					'nodeName' => $processor->get_modifiable_text(),
					'_span'    => $processor_bookmarks->getValue( $processor )[ "_{$current_bookmark_name}" ],
					'_bc'      => $processor->get_breadcrumbs(),
					'_depth'   => $get_current_depth(),
				);
				break;

			// This doesn't exist in XML_Processor now…
			case '#doctype':
				$current['childNodes'][] = array(
					'nodeType' => NODE_TYPE_DOCUMENT_TYPE,
					'nodeName' => $processor->get_modifiable_text(),
					'_span'    => $processor_bookmarks->getValue( $processor )[ "_{$current_bookmark_name}" ],
					'_bc'      => $processor->get_breadcrumbs(),
					'_depth'   => $get_current_depth(),
				);
				break;

			case '#tag':
				$tag_name = $get_tag_name();

				$attributes      = array();
				$attribute_names = $processor->get_attribute_names_with_prefix( '' );
				if ( null !== $attribute_names ) {
					foreach ( $attribute_names as $attribute_name ) {
						$val = $processor->get_attribute( $attribute_name );

						/*
						 * Attributes with no value are `true` with the XML API,
						 * We map use the empty string value in the tree structure.
						 */
						if ( true === $val ) {
							$val = '';
						}
						$attributes[] = array(
							'nodeType'  => NODE_TYPE_ATTRIBUTE,
							'specified' => true,
							'nodeName'  => $get_attribute_name( $attribute_name ),
							'nodeValue' => $val,
						);
					}
				}

				$self = array(
					'nodeType'   => NODE_TYPE_ELEMENT,
					'nodeName'   => $tag_name,
					'attributes' => $attributes,
					'childNodes' => array(),
					'_closer'    => (bool) $processor->is_tag_closer(),
					'_span'      => $processor_bookmarks->getValue( $processor )[ "_{$current_bookmark_name}" ],
					'_bc'        => $processor->get_breadcrumbs(),
					'_virtual'   => $is_virtual(),
					'_depth'     => $get_current_depth(),
					'_mode'   => $processor_parser_context->getValue($processor),
				);

				// Self-contained tags contain their inner contents as modifiable text.
				$modifiable_text = $processor->get_modifiable_text();
				if ( '' !== $modifiable_text ) {
					$self['childNodes'][] = array(
						'nodeType'  => NODE_TYPE_TEXT,
						'nodeName'  => '#text',
						'nodeValue' => $modifiable_text,
						'_span'     => null,
						'_bc'       => array_merge( $processor->get_breadcrumbs(), array( '#text' ) ),
						'_virtual'  => $is_virtual(),
						'_depth'    => $get_current_depth() + 1,
					'_mode'   => $processor_parser_context->getValue($processor),
					);
				}

				$current['childNodes'][] = $self;

				if ( $processor->is_tag_closer() ) {
					break;
				}

				/*if ( ! WP_XML_Processor::is_void( $tag_name ) ) {*/
				/*	$cursor[] = count( $current['childNodes'] ) - 1;*/
				/*}*/

				break;

			case '#text':
				$self = array(
					'nodeType'  => NODE_TYPE_TEXT,
					'nodeName'  => $processor->get_token_name(),
					'nodeValue' => $processor->get_modifiable_text(),
					'_span'     => $processor_bookmarks->getValue( $processor )[ "_{$current_bookmark_name}" ],
					'_bc'       => $processor->get_breadcrumbs(),
					'_virtual'  => $is_virtual(),
					'_depth'    => $get_current_depth(),
					'_mode'   => $processor_parser_context->getValue($processor),
				);

				$current['childNodes'][] = $self;
				break;

			case '#cdata-section':
				$self = array(
					'nodeType'  => NODE_TYPE_CDATA_SECTION,
					'nodeName'  => $processor->get_token_name(),
					'nodeValue' => $processor->get_modifiable_text(),
					'_span'     => $processor_bookmarks->getValue( $processor )[ "_{$current_bookmark_name}" ],
					'_bc'       => $processor->get_breadcrumbs(),
					'_virtual'  => $is_virtual(),
					'_depth'    => $get_current_depth(),
					'_mode'   => $processor_parser_context->getValue($processor),
				);

				$current['childNodes'][] = $self;
				break;

			case '#comment':
				$self = array(
					'nodeType' => NODE_TYPE_COMMENT,
					'_span'    => $processor_bookmarks->getValue( $processor )[ "_{$current_bookmark_name}" ],
					'_bc'      => $processor->get_breadcrumbs(),
					'_virtual' => $is_virtual(),
					'_depth'   => $get_current_depth(),
					'_mode'   => $processor_parser_context->getValue($processor),
				);
				$self['nodeName']  = $processor->get_token_name();
				$self['nodeValue'] = $processor->get_modifiable_text();
				break;

				$current['childNodes'][] = $self;
				break;

			default:
				// phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_var_export
				$serialized_token_type = var_export( $token_type, true );
				// phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped
				throw new Exception( "Unhandled token type for tree construction: {$serialized_token_type}" );
		}
	}

	if ( null !== $processor->get_last_error() ) {
		// phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped
		throw new Exception( "{$processor->get_last_error()} at {$processor_bytes_already_parsed->getValue($processor)} {$xml[$processor_bytes_already_parsed->getValue($processor)]}" );
	}

	if ( $processor->paused_at_incomplete_token() ) {
		throw new Exception( "Paused at incomplete token at {$processor_bytes_already_parsed->getValue($processor)}" );
	}

	return $tree;
}

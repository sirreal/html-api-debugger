/**
 *
 * From https://software.hixie.ch/utilities/js/live-dom-viewer/
 *
 * @param {HTMLUListElement} ul
 * @param {*} node
 */
export function printDOM( ul, node ) {
	while ( ul.firstChild ) ul.removeChild( ul.firstChild );
	for ( var i = 0; i < node.childNodes.length; i += 1 ) {
		var li = document.createElement( 'li' );
		li.className = 't' + node.childNodes[ i ].nodeType;
		if ( node.childNodes[ i ].nodeType === 10 ) {
			li.appendChild( document.createTextNode( 'DOCTYPE: ' ) );
		}
		if ( node.childNodes[ i ].nodeName ) {
			var code = document.createElement( 'code' );
			code.appendChild(
				document.createTextNode( node.childNodes[ i ].nodeName )
			);
			if ( node.childNodes[ i ].nodeValue ) {
				code.className = 'hasNodeValue';
			}
			li.appendChild( code );
		} else {
			var span = document.createElement( 'span' );
			span.appendChild( document.createTextNode( 'no name' ) );
			span.className = 'unnamed';
			li.appendChild( span );
		}
		if ( node.childNodes[ i ].nodeValue ) {
			const el = document.createElement( 'pre' );
			el.className = 'nodeValue';
			el.appendChild(
				document.createTextNode( node.childNodes[ i ].nodeValue )
			);
			li.appendChild( el );
		}
		if ( node.childNodes[ i ].attributes ) {
			for (
				var j = 0;
				j < node.childNodes[ i ].attributes.length;
				j += 1
			) {
				if ( node.childNodes[ i ].attributes[ j ].specified ) {
					var attName = document.createElement( 'code' );
					attName.appendChild(
						document.createTextNode(
							node.childNodes[ i ].attributes[ j ].nodeName
						)
					);
					attName.className = 'attribute name';
					var attValue = document.createElement( 'code' );
					attValue.appendChild(
						document.createTextNode(
							node.childNodes[ i ].attributes[ j ].nodeValue
						)
					);
					attValue.className = 'attribute value';
					var att = document.createElement( 'span' );
					att.className = 't2';
					att.appendChild( attName );
					att.appendChild( document.createTextNode( '="' ) );
					att.appendChild( attValue );
					att.appendChild( document.createTextNode( '"' ) );
					li.appendChild( document.createTextNode( ' ' ) );
					li.appendChild( att );
				}
			}
		}
		if ( node.childNodes[ i ].parentNode === node ) {
			if ( node.childNodes[ i ].childNodes.length ) {
				var ul2 = document.createElement( 'ul' );
				li.appendChild( ul2 );
				printDOM( ul2, node.childNodes[ i ] );
			}
			if ( node.childNodes[ i ].content ) {
				var ul2 = document.createElement( 'ul' );
				li.appendChild( ul2 );
				ul2.className = 'template';
				printDOM( ul2, node.childNodes[ i ].content );
			}
		} else {
			li.className += ' misparented';
		}
		ul.appendChild( li );
	}
}

/**
 * @typedef Options
 * @property {boolean} [showClosers]
 * @property {boolean} [showInvisible]
 * @property {boolean} [showVirtual]
 */

/**
 * @param {any} node
 * @param {HTMLUListElement} ul
 * @param {Options} options
 */
export function printHtmlApiTree(node, ul, options = {}) {
	while (ul.firstChild) {
		ul.removeChild(ul.firstChild);
	}

	for (var i = 0; i < node.childNodes.length; i += 1) {
		const li = document.createElement('li');
		li.className = 't' + node.childNodes[i].nodeType;
		if (node.childNodes[i].nodeType === Node.prototype.DOCUMENT_TYPE_NODE) {
			li.appendChild(document.createTextNode('DOCTYPE: '));
		}
		if (node.childNodes[i].nodeName) {
			const code = document.createElement('code');

			if (node.childNodes[i]._closer) {
				if (options.showClosers) {
					code.appendChild(
						document.createTextNode('/' + node.childNodes[i].nodeName),
					);
				} else {
					continue;
				}
			} else {
				code.appendChild(document.createTextNode(node.childNodes[i].nodeName));
			}

			if (node.childNodes[i].nodeValue) {
				code.className = 'hasNodeValue';
			}
			li.appendChild(code);
		} else {
			const span = document.createElement('span');
			span.appendChild(document.createTextNode('no name'));
			span.className = 'unnamed';
			li.appendChild(span);
		}
		if (node.childNodes[i].nodeValue) {
			const el = document.createElement('pre');
			el.className = 'nodeValue';
			el.appendChild(
				document.createTextNode(
					options.showInvisible
						? replaceInvisible(node.childNodes[i].nodeValue)
						: node.childNodes[i].nodeValue,
				),
			);
			li.appendChild(el);
		}
		if (node.childNodes[i]._span) {
			li.dataset['spanStart'] = node.childNodes[i]._span.start;
			li.dataset['spanLength'] = node.childNodes[i]._span.length;
		}
		if (node.childNodes[i]._bc?.length) {
			li.title = node.childNodes[i]._bc.join(' > ');
		}
		if (
			options.showVirtual &&
			typeof node.childNodes[i]._virtual === 'boolean'
		) {
			li.classList.add(node.childNodes[i]._virtual ? 'is-virtual' : 'is-real');
		}
		if (node.childNodes[i]._depth) {
			li.title = `(${node.childNodes[i]._depth}) ${li.title}`;
		}
		if (node.childNodes[i]._closer) {
			li.classList.add('tag-closer');
		}
		if (node.childNodes[i].attributes) {
			for (var j = 0; j < node.childNodes[i].attributes.length; j += 1) {
				if (node.childNodes[i].attributes[j].specified) {
					const attName = document.createElement('code');
					attName.appendChild(
						document.createTextNode(node.childNodes[i].attributes[j].nodeName),
					);
					attName.className = 'attribute name';
					const attValue = document.createElement('code');
					attValue.appendChild(
						document.createTextNode(node.childNodes[i].attributes[j].nodeValue),
					);
					attValue.className = 'attribute value';
					const att = document.createElement('span');
					att.className = 't2';
					att.appendChild(attName);
					att.appendChild(document.createTextNode('="'));
					att.appendChild(attValue);
					att.appendChild(document.createTextNode('"'));
					li.appendChild(document.createTextNode(' '));
					li.appendChild(att);
				}
			}
		}

		if (node.childNodes[i].childNodes?.length) {
			const ul2 = document.createElement('ul');
			li.appendChild(ul2);
			printHtmlApiTree(node.childNodes[i], ul2, options);
		}
		if (node.childNodes[i].content) {
			const ul2 = document.createElement('ul');
			li.appendChild(ul2);
			ul2.className = 'template';
			printHtmlApiTree(node.childNodes[i].content, ul2, options);
		}

		ul.appendChild(li);
	}
}

/**
 * @param {string} s
 * @return {string}
 */
function replaceInvisible(s) {
	return s.replace(/[\x00-\x1f\x7f}]/gu, (c) => {
		const charCode = c.charCodeAt(0);
		switch (charCode) {
			// U+007F DELETE -> U+2421 SYMBOL FOR DELETE
			case 0x7f:
				return '\u{2421}';

			// Include a newline with newline replacement
			case 0x0a:
				return '\u{240A}\n';
		}

		// There's a nice Control Pictures Block at 0x2400 offset for the matched range
		return String.fromCharCode(charCode + 0x2400);
	});
}

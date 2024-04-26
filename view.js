import * as I from "@wordpress/interactivity";
import { printDOM } from "./dom-utils.js";

/** @type {typeof import('@wordpress/api-fetch').default} */
const apiFetch = window.wp.apiFetch;

const NS = "html-api-debugger";

/** @type {HTMLIFrameElement} */
let RENDERED_IFRAME;

var { state } = I.store(NS, {
  state: {
    html: "",
    DOM: {
      renderingMode: "",
      title: "",
    },
  },
  run() {
    RENDERED_IFRAME = document.getElementById("rendered_iframe");
  },
  onRenderedIframeLoad(e) {
    const doc = e.target.contentWindow.document;
    state.DOM.renderingMode = doc.compatMode;
    state.DOM.title = doc.title || "[document has no title]";

    printDOM(document.getElementById("dom_tree"), doc);
  },
  handleChange: function* (e) {
    const val = e.target.value;

    state.html = val;

    const resp = yield apiFetch({
      path: `${NS}/v1/htmlapi`,
      method: "POST",
      data: { html: val },
    });

    if (resp.error) {
      state.htmlapiResult = "";
      state.htmlapiError = resp.error;
      return;
    }

    state.htmlapiError = "";
    state.htmlapiResult = resp.result;
  },
  watch() {
    RENDERED_IFRAME.contentWindow.document.open();
    RENDERED_IFRAME.contentWindow.document.write(
      "<!DOCTYPE html>\n<html>\n<body>" + state.html,
    );
    RENDERED_IFRAME.contentWindow.document.close();
  },
});

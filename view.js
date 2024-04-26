import * as I from "@wordpress/interactivity";

/** @type {typeof import('@wordpress/api-fetch').default} */
const apiFetch = window.wp.apiFetch;

const NS = "html-api-debugger";
const SRC_BASE = "https://software.hixie.ch/utilities/js/live-dom-viewer/";

const { state } = I.store(NS, {
  state: {
    htmlapiResult: "",
    html: "",
    get src() {
      return `${SRC_BASE}?${encodeURIComponent(state.html)}`;
    },
  },
  handleChange: function* (e) {
    const val = e.target.value;

    state.html = val;
    state.htmlapiResult = JSON.stringify(
      yield apiFetch({
        path: `${NS}/v1/htmlapi`,
        method: "POST",
        data: { html: val },
      }),
    );
  },
  async watch() {},
});

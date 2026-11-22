/**
 * State and behaviour of the feedback form once the page is interactive.
 *
 * Until hydration the form is the plain `method="post"` one the prerender
 * wrote; the first effect then reads the URL (CLI prefill, status of a plain
 * post), starts the form's clock and from there `submit` replaces the browser
 * post with a `fetch`.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { LINKS } from "../data/links.js";
import { localeHref } from "../i18n/locale-href.js";
import { buildPayload } from "./build-payload.js";
import { prefillFromQuery } from "./prefill-from-query.js";
import { DEFAULT_KIND } from "./rules.js";
import { statusFromQuery, withoutStatus } from "./status-from-query.js";
import { submitFeedback } from "./submit-feedback.js";
import { validateFeedback } from "./validate-feedback.js";

const FRAGMENT = "#feedback";
const FIRST_FIELD_ID = "feedback-field-title";
const STATUS_ID = "feedback-status";
const EMPTY_VALUES = Object.freeze({
  kind: DEFAULT_KIND,
  title: "",
  message: "",
  email: "",
  installId: "",
});

/**
 * Puts the keyboard where it is useful when a link targets the form. The
 * browser scrolls to the fragment itself, once the document has loaded, and
 * that step drops the focus — hence waiting for it. Without a pointer to aim
 * (touch) only a status is focused: a focused field would raise the keyboard.
 */
function focusOnArrival(hasStatus) {
  const isPointerFine = window.matchMedia("(pointer: fine)").matches;
  const target = hasStatus ? STATUS_ID : isPointerFine ? FIRST_FIELD_ID : null;
  document.getElementById(target)?.focus({ preventScroll: true });
}

/** @returns {() => void} cancels a pending focus. */
function arriveAtForm(hasStatus) {
  if (window.location.hash !== FRAGMENT) return () => {};
  const arrive = () => requestAnimationFrame(() => focusOnArrival(hasStatus));
  if (document.readyState === "complete") {
    arrive();
    return () => {};
  }
  window.addEventListener("load", arrive, { once: true });
  return () => window.removeEventListener("load", arrive);
}

function focusField(name) {
  document.getElementById(`feedback-field-${name}`)?.focus();
}

/** @param {import("../i18n/locales.js").Locale} locale */
export function useFeedbackForm(locale) {
  const [values, setValues] = useState(EMPTY_VALUES);
  const [context, setContext] = useState({});
  const [returnTo, setReturnTo] = useState(localeHref(locale, LINKS.origin));
  const [startedAt, setStartedAt] = useState(null);
  const [status, setStatus] = useState(null);
  const [invalidFields, setInvalidFields] = useState([]);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    const { search, origin, pathname } = window.location;
    const { installId, ...rest } = prefillFromQuery(search);
    const arrivalStatus = statusFromQuery(search);
    if (installId) setValues((current) => ({ ...current, installId }));
    setContext(rest);
    setReturnTo(`${origin}${pathname}`);
    setStartedAt(Date.now());
    if (arrivalStatus) {
      // Guarded: dev's StrictMode runs this twice, the second time on the cleaned URL.
      setStatus(arrivalStatus);
      window.history.replaceState(null, "", withoutStatus(window.location.href));
    }
  }, []);

  // After the commit that carries the status: a hidden or empty region cannot take focus.
  const isHydrated = startedAt !== null;
  const hasArrived = useRef(false);
  useEffect(() => {
    if (!isHydrated || hasArrived.current) return;
    hasArrived.current = true;
    return arriveAtForm(status !== null);
  }, [isHydrated, status]);

  const setValue = useCallback(
    (name, value) => setValues((current) => ({ ...current, [name]: value })),
    [],
  );

  const applyResult = useCallback((result) => {
    setStatus(result.outcome);
    setInvalidFields(result.fields);
    if (result.outcome === "sent") {
      // The report goes; who sent it (kind, address, install ID) stays for the next one.
      setValues((current) => ({ ...current, title: "", message: "" }));
      setStartedAt(Date.now());
    }
  }, []);

  const submit = useCallback(
    async (event) => {
      event.preventDefault();
      if (isSending) return;
      const invalid = validateFeedback(values);
      setInvalidFields(invalid);
      setStatus(invalid.length ? "invalid" : null);
      if (invalid.length) return focusField(invalid[0]);
      setIsSending(true);
      const payload = buildPayload({ ...values, ...context, locale: locale.id, startedAt });
      applyResult(await submitFeedback(payload));
      setIsSending(false);
    },
    [applyResult, context, isSending, locale.id, startedAt, values],
  );

  return {
    values,
    setValue,
    context,
    returnTo,
    startedAt,
    status,
    invalidFields,
    isSending,
    isHydrated,
    submit,
  };
}

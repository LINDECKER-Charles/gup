/**
 * Browser entry.
 *
 * The prerender writes the page markup into #root and the resolved messages
 * into an inline JSON block; this entry reads that block and hydrates. In dev
 * #root only holds the slot comment, so it mounts from scratch — hence the
 * `firstElementChild` test (a comment is a child node, an element is not).
 */
import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { Page } from "./Page.jsx";
import { readBootstrap } from "./i18n/read-bootstrap.js";
import "./styles/index.css";

const { locale, messages } = readBootstrap(document);
const container = document.getElementById("root");
const tree = (
  <StrictMode>
    <Page locale={locale} messages={messages} />
  </StrictMode>
);

if (container.firstElementChild) {
  hydrateRoot(container, tree);
} else {
  createRoot(container).render(tree);
}

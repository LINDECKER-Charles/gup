/**
 * Browser entry.
 *
 * `npm run build` prerenders <Page /> into #root (see scripts/prerender.mjs),
 * so in production the markup is already there and this hydrates it; in dev
 * the container is empty and it mounts from scratch. Branching on
 * `hasChildNodes` keeps one entry file for both.
 */
import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { Page } from "./Page.jsx";
import "./styles/index.css";

const container = document.getElementById("root");
const tree = (
  <StrictMode>
    <Page />
  </StrictMode>
);

if (container.hasChildNodes()) {
  hydrateRoot(container, tree);
} else {
  createRoot(container).render(tree);
}

// Composition root — mounts <App /> on #root.
// Stylesheet is imported here so Vite can bundle and hash it; the <link>
// tag was removed from index.html in the build-tool migration.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Nav } from "./sections/Nav.jsx";
import { Hero } from "./sections/Hero.jsx";
import { Problem } from "./sections/Problem.jsx";
import { Modes } from "./sections/Modes.jsx";
import { Architecture } from "./sections/Architecture.jsx";
import { Lifecycle } from "./sections/Lifecycle.jsx";
import { Providers } from "./sections/Providers.jsx";
import { Install } from "./sections/Install.jsx";
import { Footer } from "./sections/Footer.jsx";
import "../styles.css";

function App() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Problem />
        <Modes />
        <Architecture />
        <Lifecycle />
        <Providers />
        <Install />
      </main>
      <Footer />
    </>
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

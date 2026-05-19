// Providers catalog — category filter + free-text search.
import { useMemo, useState } from "react";
import { Container } from "../ui/Container.jsx";
import { Search } from "../lib/icons.jsx";
import { providers as allProviders } from "../data/providers.js";
import { content as siteContent } from "../data/content.js";

function ProvidersToolbar({ categories, filter, onFilter, query, onQuery, content }) {
  return (
    <div className="cat-filters">
      <div className="cat-search">
        <span className="cat-search-icon"><Search /></span>
        <input
          type="text"
          placeholder={content.searchPlaceholder}
          value={query}
          onChange={(e) => onQuery(e.target.value)}
        />
      </div>
      {categories.map(([cat, count]) => (
        <button
          key={cat}
          className={`cat-chip ${filter === cat ? "active" : ""}`}
          onClick={() => onFilter(cat)}
        >
          {cat} <span className="count">{count}</span>
        </button>
      ))}
    </div>
  );
}

function ProviderCell({ provider }) {
  return (
    <div className="cat-cell">
      <span className="cat-id">{provider.id}</span>
      <span className="cat-name">{provider.name}</span>
      {provider.slow && (
        <span className="cat-slow">
          <span className="cat-slow-dot" />
          slow · skip en --fast
        </span>
      )}
    </div>
  );
}

export function Providers() {
  const content = siteContent.providers;

  const [filter, setFilter] = useState(content.allLabel);
  const [query, setQuery] = useState("");

  const categories = useMemo(() => {
    const counts = new Map([[content.allLabel, allProviders.length]]);
    for (const p of allProviders) counts.set(p.category, (counts.get(p.category) || 0) + 1);
    return Array.from(counts.entries());
  }, [content.allLabel]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allProviders.filter((p) => {
      if (filter !== content.allLabel && p.category !== filter) return false;
      if (q && !p.id.toLowerCase().includes(q) && !p.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [filter, query, content.allLabel]);

  return (
    <section id="providers">
      <Container>
        <div className="sec-head">
          <div className="sec-label">{content.sectionLabel}</div>
          <div className="sec-title">
            <h2>{content.title}</h2>
            <p>
              Chaque cellule est un fichier isolé dans <code className="inline-mono">src/providers/</code>. Pas d'import croisé, pas d'état partagé. Le badge <em className="em-accent">slow</em> marque les providers qui font du HTTP par paquet — ignorés en mode <code className="inline-mono">--fast</code>.
            </p>
          </div>
        </div>

        <ProvidersToolbar
          categories={categories}
          filter={filter}
          onFilter={setFilter}
          query={query}
          onQuery={setQuery}
          content={content}
        />

        <div className="cat-grid">
          {filtered.length === 0 && (
            <div className="cat-empty">{content.emptyLabel}</div>
          )}
          {filtered.map((p) => (
            <ProviderCell key={p.id} provider={p} />
          ))}
        </div>
      </Container>
    </section>
  );
}

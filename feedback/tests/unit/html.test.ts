import { describe, expect, it } from "vitest";
import { html } from "../../src/views/kit/html.js";

describe("html", () => {
  it("escapes interpolated text, attributes included", () => {
    const hostile = `"><script>alert('x')</script>&`;
    const rendered = html`<p title="${hostile}">${hostile}</p>`.toString();
    expect(rendered).not.toContain("<script>");
    expect(rendered).toBe(
      "<p title=\"&quot;&gt;&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;&amp;\">"
      + "&quot;&gt;&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;&amp;</p>",
    );
  });

  it("inserts nested templates as markup, and nothing for null", () => {
    const rendered = html`<ul>${["a", "<b>"].map((item) => html`<li>${item}</li>`)}${null}</ul>`;
    expect(rendered.toString()).toBe("<ul><li>a</li><li>&lt;b&gt;</li></ul>");
  });
});

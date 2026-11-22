/**
 * Whether this run is a CI job: `CI` set to anything but the empty string,
 * as GitHub Actions, GitLab CI, Azure Pipelines and most others do. Nobody
 * is there to answer a question or to see a browser open.
 */

const CI_ENV = "CI";

export function isCiRun(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env[CI_ENV] ?? "") !== "";
}

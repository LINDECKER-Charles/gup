/**
 * Fills a development database with fictional feedback and two installs, so
 * the back office has something to show: six weeks of runs each, their
 * history and log lines sharing run IDs, a few updates failing with an error
 * logged. Placeholder data only.
 *
 *   DATABASE_URL=… FEEDBACK_ENV=development npm run seed:demo -- --yes
 *
 * Each feedback queues its notification mail like a real one: with the dev
 * compose stack, they land in Mailpit.
 */
import pg from "pg";
import type { FeedbackStatus, NewFeedback } from "../src/domain/feedback.js";
import { validateLogBatch } from "../src/domain/validate-log-batch.js";
import { migrate } from "../src/store/migrate.js";
import { PgFeedbackRepository } from "../src/store/feedback/pg-feedback-repository.js";
import { PgInstallStore } from "../src/store/pg-install-store.js";
import { demoBatches, type DemoJournalOptions } from "./lib/demo-journal.js";
import { InstallKey } from "./lib/install-key.js";

const EXIT_USAGE = 2;

function refuse(message: string): never {
  process.stderr.write(`seed:demo: ${message}\n`);
  process.exit(EXIT_USAGE);
}

if (!process.argv.includes("--yes")) refuse("adds demo rows to DATABASE_URL; pass --yes.");
if ((process.env["FEEDBACK_ENV"] ?? "production") === "production") {
  refuse("refused while FEEDBACK_ENV is production (set FEEDBACK_ENV=development).");
}
const databaseUrl = process.env["DATABASE_URL"] ?? refuse("DATABASE_URL is not set.");

// Real install IDs, derived from fresh keys: the back office shows them like any other.
const WIN_INSTALL = InstallKey.generate().installId;
const LINUX_INSTALL = InstallKey.generate().installId;

type DemoFeedback = Pick<NewFeedback, "kind" | "title" | "message"> & {
  readonly email?: string;
  readonly installId?: string;
  readonly status: FeedbackStatus;
};

const FEEDBACK: readonly DemoFeedback[] = [
  { kind: "bug", status: "new", installId: WIN_INSTALL, email: "alice@example.com",
    title: "La mise à jour de Git échoue",
    message: "winget renvoie le code 1603 à chaque mise à jour de Git.Git depuis hier." },
  { kind: "suggestion", status: "new",
    title: "Pouvoir ignorer un paquet",
    message: "J'aimerais exclure définitivement un paquet des mises à jour proposées." },
  { kind: "bug", status: "in_progress", installId: LINUX_INSTALL,
    title: "Le scan flatpak est très lent",
    message: "Le scan des applications flatpak prend plus d'une minute sur ma machine." },
  { kind: "suggestion", status: "in_progress", email: "bob@example.org",
    title: "Thème à fort contraste",
    message: "Un thème à fort contraste aiderait à lire le menu sur un terminal clair." },
  { kind: "bug", status: "resolved",
    title: "Accents mal affichés",
    message: "Les accents du menu s'affichaient en caractères étranges sous cmd.exe." },
  { kind: "suggestion", status: "resolved",
    title: "Exporter le rapport en JSON",
    message: "Un export JSON du dernier scan serait pratique pour mes scripts." },
  { kind: "bug", status: "dismissed",
    title: "Le menu ne s'ouvre pas",
    message: "Fausse alerte : c'était mon terminal qui ne gérait pas le mode brut." },
  { kind: "suggestion", status: "new", email: "carol@example.net",
    title: "Planifier les mises à jour la nuit",
    message: "Une option pour lancer les mises à jour à 3 h du matin serait idéale." },
];

function toNewFeedback(demo: DemoFeedback): NewFeedback {
  return {
    kind: demo.kind, title: demo.title, message: demo.message,
    email: demo.email ?? null, installId: demo.installId ?? null,
    gupVersion: "0.6.0", platform: demo.installId === LINUX_INSTALL ? "linux" : "win32",
    locale: "fr",
  };
}

const DEMO_WEEKS = 6;

/** Uploads the install's weeks of journals as the CLI would, one batch a week. */
async function seedInstall(
  store: PgInstallStore, installId: string, journal: Omit<DemoJournalOptions, "weeks" | "now">,
): Promise<number> {
  let items = 0;
  for (const batch of demoBatches({ ...journal, weeks: DEMO_WEEKS, now: new Date() })) {
    const validation = validateLogBatch(batch);
    if (!validation.ok) throw new Error(`demo batch rejected: ${JSON.stringify(validation)}`);
    await store.storeBatch({ installId, batch: validation.value, mayCreateInstall: true });
    items += validation.value.history.length + validation.value.logs.length;
  }
  return items;
}

const pool = new pg.Pool({ connectionString: databaseUrl });
try {
  await migrate(pool);
  const store = new PgInstallStore(pool);
  const items = await seedInstall(store, WIN_INSTALL, { platform: "win32", seed: 1 })
    + await seedInstall(store, LINUX_INSTALL, { platform: "linux", seed: 2 });
  const repository = new PgFeedbackRepository(pool);
  for (const demo of FEEDBACK) {
    const id = await repository.create(toNewFeedback(demo));
    if (demo.status !== "new") await repository.updateStatus(id, demo.status);
  }
  process.stdout.write(
    `seed:demo: ${FEEDBACK.length} feedback, 2 installs, ${items} journal items added.\n`);
} finally {
  await pool.end();
}

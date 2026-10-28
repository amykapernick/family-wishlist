// Usage:
//   npm run db:pull   replace the local database with a copy of the live one
//   npm run db:push   replace the live database with a copy of the local one
//   npm run db:restore -- local|live <file>   put a backup back
//
// Both copy everything (schema, data and migration history), so the two end
// up identical. The database being replaced is backed up to backups/ first.
// Anything that changes the live database asks you to type "yes" first;
// pass --yes to skip that.

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';

type Where = { remote: boolean };

const args = process.argv.slice(2);
const command = args[0];
const restoreFile = command === 'restore' ? args[2] : undefined;
if (
	!(command === 'pull' || command === 'push') &&
	!(command === 'restore' && (args[1] === 'local' || args[1] === 'live') && restoreFile)
) {
	console.error(
		'Usage: node scripts/db-sync.ts pull|push [--yes]\n' +
			'       node scripts/db-sync.ts restore local|live <file> [--yes]'
	);
	process.exit(1);
}

const local: Where = { remote: false };
const live: Where = { remote: true };
/** `from` is null when restoring from a file. */
const [from, to]: [Where | null, Where] =
	command === 'pull'
		? [live, local]
		: command === 'push'
			? [local, live]
			: [null, args[1] === 'live' ? live : local];
const label = (where: Where) => (where.remote ? 'live' : 'local');

function wrangler(where: Where, ...rest: string[]): string {
	const location = where.remote ? '--remote' : '--local';
	// export doesn't take --yes (and doesn't prompt); execute does.
	const yes = rest[0] === 'execute' ? ['--yes'] : [];
	return execFileSync('npx', ['wrangler', 'd1', ...rest, 'DB', location, ...yes], {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'inherit']
	});
}

const exportTo = (where: Where, file: string) => wrangler(where, 'export', '--output', file);

/** Drops every table, so the import can recreate them exactly. */
function wipe(where: Where) {
	const out = wrangler(
		where,
		'execute',
		'--json',
		'--command',
		`SELECT type, name FROM sqlite_master
		 WHERE type IN ('table', 'view', 'trigger')
		 AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'`
	);
	const objects = JSON.parse(out)[0].results as { type: string; name: string }[];
	if (objects.length === 0) return;
	// Triggers and views first; foreign keys are checked at the end, once all are gone.
	const order = { trigger: 0, view: 1, table: 2 } as Record<string, number>;
	const drops = objects
		.sort((a, b) => order[a.type] - order[b.type])
		.map((o) => `DROP ${o.type.toUpperCase()} IF EXISTS "${o.name.replaceAll('"', '""')}";`);
	wrangler(where, 'execute', '--command', ['PRAGMA defer_foreign_keys = on;', ...drops].join(' '));
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
mkdirSync('backups', { recursive: true });
const backup = join('backups', `${label(to)}-${stamp}.sql`);
const work = mkdtempSync(join(tmpdir(), 'db-sync-'));
const copy = restoreFile ?? join(work, `${label(from!)}.sql`);
const source = from ? `the ${label(from)} database` : restoreFile;

if (to.remote && !args.includes('--yes')) {
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	const answer = await rl.question(
		`This replaces EVERYTHING in the live database with ${source}.\n` +
			'Anything changed on the live site since then will be lost.\n' +
			'Type "yes" to continue: '
	);
	rl.close();
	if (answer.trim().toLowerCase() !== 'yes') {
		console.log('Cancelled. Nothing was changed.');
		process.exit(1);
	}
}

let backedUp = false;
try {
	console.log(`Backing up the ${label(to)} database to ${backup}...`);
	exportTo(to, backup);
	backedUp = true;
	if (from) {
		console.log(`Copying ${source}...`);
		exportTo(from, copy);
	}
	console.log(`Replacing the ${label(to)} database...`);
	wipe(to);
	wrangler(to, 'execute', '--file', copy);
	console.log(`Done. The ${label(to)} database now matches ${source}.`);
	console.log(`To undo: npm run db:restore -- ${label(to)} ${backup}`);
} catch (err) {
	if (backedUp) {
		console.error(`\nSomething went wrong. The ${label(to)} database was backed up to ${backup}.`);
		console.error(`To put it back: npm run db:restore -- ${label(to)} ${backup}`);
	} else {
		console.error(`\nCouldn’t back up the ${label(to)} database, so nothing was changed.`);
		rmSync(backup, { force: true });
	}
	process.exitCode = 1;
} finally {
	rmSync(work, { recursive: true, force: true });
}

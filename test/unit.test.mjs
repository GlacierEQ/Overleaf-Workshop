import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// Test elapsedTime logic ported from chat-view/src/utils.ts
function elapsedTime(timestamp, now = Date.now()) {
    const msPerMinute = 60 * 1000;
    const msPerHour = msPerMinute * 60;
    const msPerDay = msPerHour * 24;
    const msPerMonth = msPerDay * 30;
    const msPerYear = msPerDay * 365;

    const elapsed = Math.max(now - timestamp, 0);

    if (elapsed < msPerMinute) {
        const elapsedSeconds = Math.round(elapsed / 1000);
        return elapsedSeconds === 0 ? 'now' : elapsedSeconds + 's';
    } else if (elapsed < msPerHour) {
        const elapsedMinutes = Math.round(elapsed / msPerMinute);
        return elapsedMinutes === 1 ? '1 min' : elapsedMinutes + ' mins';
    } else if (elapsed < msPerDay) {
        const elapsedHours = Math.round(elapsed / msPerHour);
        return elapsedHours === 1 ? '1 hour' : elapsedHours + ' hours';
    } else if (elapsed < msPerMonth) {
        const elapsedDays = Math.round(elapsed / msPerDay);
        return elapsedDays === 1 ? '1 day' : elapsedDays + ' days';
    } else if (elapsed < msPerYear) {
        const elapsedMonths = Math.round(elapsed / msPerMonth);
        return elapsedMonths === 1 ? '1 month' : elapsedMonths + ' months';
    } else {
        const elapsedYears = Math.round(elapsed / msPerYear);
        return elapsedYears === 1 ? '1 year' : elapsedYears + ' years';
    }
}

describe('Chat View Utilities', () => {
    test('elapsedTime returns "now" for immediate events', () => {
        const now = 1700000000000;
        assert.equal(elapsedTime(now, now), 'now');
        assert.equal(elapsedTime(now - 400, now), 'now');
    });

    test('elapsedTime formats seconds, minutes, hours properly', () => {
        const now = 1700000000000;
        assert.equal(elapsedTime(now - 15000, now), '15s');
        assert.equal(elapsedTime(now - 60000, now), '1 min');
        assert.equal(elapsedTime(now - 300000, now), '5 mins');
        assert.equal(elapsedTime(now - 3600000, now), '1 hour');
        assert.equal(elapsedTime(now - 7200000, now), '2 hours');
    });

    test('elapsedTime handles days, months, and years', () => {
        const now = 1700000000000;
        const oneDay = 24 * 3600 * 1000;
        assert.equal(elapsedTime(now - oneDay, now), '1 day');
        assert.equal(elapsedTime(now - 5 * oneDay, now), '5 days');
        assert.equal(elapsedTime(now - 35 * oneDay, now), '1 month');
        assert.equal(elapsedTime(now - 400 * oneDay, now), '1 year');
    });
});

describe('Package Manifest Integrity', () => {
    test('package.json contains valid VS Code extension fields', () => {
        const pkgPath = path.join(ROOT_DIR, 'package.json');
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

        assert.equal(pkg.name, 'overleaf-workshop');
        assert.equal(pkg.publisher, 'iamhyc');
        assert.ok(pkg.engines && pkg.engines.vscode);
        assert.ok(Array.isArray(pkg.activationEvents));
        assert.ok(pkg.contributes && pkg.contributes.commands);
    });

    test('contributes commands are unique and properly structured', () => {
        const pkgPath = path.join(ROOT_DIR, 'package.json');
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        const commands = pkg.contributes.commands;

        const commandIds = new Set();
        for (const cmd of commands) {
            assert.ok(cmd.command, 'Command must have an identifier');
            assert.ok(cmd.title, `Command ${cmd.command} must have a title`);
            assert.ok(!commandIds.has(cmd.command), `Duplicate command: ${cmd.command}`);
            commandIds.add(cmd.command);
        }
        assert.ok(commandIds.size >= 10, 'Expected at least 10 extension commands');
    });
});

describe('LaTeX Parsing Primitives', () => {
    function extractCitations(text) {
        const matches = [...text.matchAll(/\\cite(?:\[[^\]]*\])*\{([^}]+)\}/g)];
        return matches.flatMap(m => m[1].split(',').map(s => s.trim()));
    }

    test('extractCitations parses standard and multi-key citations', () => {
        const sample = `
            According to \\cite{knuth1984}, TeX is powerful.
            Prior work \\cite[see][p. 15]{lamport1994,einstein1905} verified this.
        `;
        const cites = extractCitations(sample);
        assert.deepEqual(cites, ['knuth1984', 'lamport1994', 'einstein1905']);
    });

    test('detects matched environment pairs', () => {
        const sample = `\\begin{equation}\n E=mc^2 \n\\end{equation}`;
        const hasBegin = /\\begin\{equation\}/.test(sample);
        const hasEnd = /\\end\{equation\}/.test(sample);
        assert.ok(hasBegin && hasEnd);
    });
});

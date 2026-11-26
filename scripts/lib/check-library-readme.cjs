'use strict';

// Shared checker for MIT library READMEs. Keep this copy in sync with the
// canonical checker distributed alongside the library review instructions.
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const process = require('node:process');

const order = [
  'Contents',
  'Installation',
  'Usage',
  'Common tasks',
  'API summary',
  'Behaviour',
  'TypeScript',
  'Performance',
  'Migration',
  'Development',
  'Further reading',
  'Licence'
];
const required = ['Contents', 'Installation', 'Usage', 'API summary', 'Licence'];

// Organisational policy: never infer the expected owner from the files or
// remotes being checked. Account transfers must update this canonical policy.
const githubOwner = 'fishgoldworks';
const previousGithubOwners = new Set(['koyote130708']);

function githubLinks(text) {
  const entities = { amp: '&', colon: ':', sol: '/', period: '.', hyphen: '-', lowbar: '_' };
  const decoded = text
    .replace(/&#(x[0-9a-f]+|[0-9]+);?/gi, (_, value) => {
      const point = value[0].toLowerCase() === 'x' ? parseInt(value.slice(1), 16) : parseInt(value, 10);
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : '\ufffd';
    })
    .replace(/&(amp|colon|sol|period|hyphen|lowbar);/gi, (_, value) => entities[value.toLowerCase()])
    .replace(/\\u([0-9a-f]{4})/gi, (_, value) => String.fromCharCode(parseInt(value, 16)))
    .replace(/%([0-9a-f]{2})/gi, (_, value) => String.fromCharCode(parseInt(value, 16)))
    .replace(/\\\//g, '/');

  return [...decoded.matchAll(/\bgithub\.com(?::\d+)?[/:]([\w.-]+)\/([\w.-]+)/gi)].map((match) => ({
    owner: match[1].toLowerCase(),
    repository: match[2].replace(/\.git$/i, '').toLowerCase()
  }));
}

function checkDocumentationOwnership(text, label, repositories = new Set()) {
  for (const link of githubLinks(text)) {
    const firstParty =
      repositories.has(link.repository) || (previousGithubOwners.has(link.owner) && link.repository.startsWith('go-'));

    assert.ok(
      !firstParty || link.owner === githubOwner,
      label + ': repository link must use GitHub owner ' + githubOwner
    );
  }
}

function checkOwnership(root, { git = true } = {}) {
  const repositories = new Set();
  const manifestFile = path.join(root, 'package.json');
  assert.ok(fs.existsSync(manifestFile), root + ': missing package.json for ownership check');

  for (const file of [manifestFile, path.join(root, 'package', 'package.json')]) {
    if (!fs.existsSync(file)) {
      continue;
    }

    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    const name = manifest.name?.split('/').at(-1);
    if (name?.startsWith('go-')) {
      repositories.add(name.toLowerCase());
    }

    for (const field of ['homepage', 'repository', 'bugs']) {
      const value = typeof manifest[field] === 'string' ? manifest[field] : manifest[field]?.url;
      if (typeof value !== 'string') {
        continue;
      }

      const shorthand = field === 'repository' && /^(?:github:)?([\w.-]+)\/([\w.-]+)$/.exec(value);
      const links = shorthand
        ? [{ owner: shorthand[1].toLowerCase(), repository: shorthand[2].toLowerCase() }]
        : githubLinks(value);
      for (const link of links) {
        if (field === 'repository') {
          repositories.add(link.repository);
        }

        const firstParty =
          name?.startsWith('go-') || (previousGithubOwners.has(link.owner) && link.repository.startsWith('go-'));
        assert.ok(
          !firstParty || link.owner === githubOwner,
          file + ': ' + field + ' must use GitHub owner ' + githubOwner
        );
      }
    }
  }

  function checkDocuments(directory, relative = '') {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      const name = relative + entry.name;
      if (entry.isSymbolicLink()) {
        continue;
      }

      if (entry.isDirectory()) {
        const excluded =
          /^(?:node_modules|\.git|\.tmp|temp|artifacts|coverage|reviews?|baselines?|performance-history|playbook)$/.test(
            entry.name
          ) ||
          /^\.build-/.test(entry.name) ||
          /(?:^|\/)benchmarks\/baseline(?:[-_.]|$)/.test(name);
        if (!excluded) {
          checkDocuments(file, name + '/');
        }
      } else if (
        entry.isFile() &&
        /\.(?:md|mdx|html?|rst|txt)$/i.test(entry.name) &&
        !/^(?:LICEN[CS]E|NOTICE|COPYING)(?:[.-]|$)/i.test(entry.name)
      ) {
        checkDocumentationOwnership(fs.readFileSync(file, 'utf8'), file, repositories);
      }
    }
  }

  // Deliberately include ignored current HTML/package documentation; Git's
  // tracked-file list cannot establish that generated output is current.
  checkDocuments(root);

  if (!git || !fs.existsSync(path.join(root, '.git'))) {
    return { git: git ? 'unavailable' : 'not requested' };
  }

  const result = spawnSync(
    'git',
    ['-C', root, 'config', '--includes', '--get-regexp', '^remote\\..*\\.(url|pushurl)$'],
    {
      encoding: 'utf8'
    }
  );
  assert.ok(!result.error && [0, 1].includes(result.status), root + ': unable to inspect configured Git remotes');
  const remotes = new Set();
  for (const line of result.stdout.trim().split(/\r?\n/).filter(Boolean)) {
    const split = line.indexOf(' ');
    const key = line.slice(0, split);
    remotes.add(key.slice('remote.'.length).replace(/\.(?:url|pushurl)$/, ''));
    for (const link of githubLinks(line.slice(split + 1))) {
      const firstParty =
        key.startsWith('remote.origin.') ||
        repositories.has(link.repository) ||
        (previousGithubOwners.has(link.owner) && link.repository.startsWith('go-'));

      // Report only the key: remote URLs can contain authentication material.
      assert.ok(!firstParty || link.owner === githubOwner, root + ': ' + key + ' must use GitHub owner ' + githubOwner);
    }
  }

  // Enumerate independently: effective remotes may also be inherited from
  // included/global/worktree configuration rather than local URL keys.
  const effective = spawnSync('git', ['-C', root, 'remote'], { encoding: 'utf8' });
  assert.ok(!effective.error && effective.status === 0, root + ': unable to enumerate effective Git remotes');
  for (const remote of effective.stdout.trim().split(/\r?\n/).filter(Boolean)) {
    remotes.add(remote);
  }

  for (const remote of remotes) {
    for (const direction of ['fetch', 'push']) {
      const args = ['-C', root, 'remote', 'get-url', '--all', ...(direction === 'push' ? ['--push'] : []), remote];
      const resolved = spawnSync('git', args, { encoding: 'utf8' });
      assert.ok(!resolved.error && resolved.status === 0, root + ': unable to inspect effective Git remote ' + remote);

      for (const link of githubLinks(resolved.stdout)) {
        const firstParty =
          remote === 'origin' ||
          repositories.has(link.repository) ||
          (previousGithubOwners.has(link.owner) && link.repository.startsWith('go-'));
        assert.ok(
          !firstParty || link.owner === githubOwner,
          root + ': ' + remote + ' ' + direction + ' must use GitHub owner ' + githubOwner
        );
      }
    }
  }

  return { git: remotes.size ? 'checked' : 'no remotes' };
}

function proseLines(markdown, fences = []) {
  let fence;
  let fenceDepth = 0;
  return markdown
    .replace(/\r\n/g, '\n')
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
    .map((line, index) => {
      const quote = /^(?: {0,3}>[ \t]?)+/.exec(line)?.[0] || '';
      const quoteParts = quote.match(/ {0,3}>[ \t]?/g) || [];
      // Closing an outer quote container also closes any fence nested inside it.
      if (fence && quoteParts.length < fenceDepth) {
        fence = undefined;
      }
      const depth = fence ? fenceDepth : quoteParts.length;
      const content = line.slice(quoteParts.slice(0, depth).join('').length);
      const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(content);
      if (fence) {
        if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) {
          fence = undefined;
        }
        return '';
      }
      if (!marker) {
        return line;
      }
      fence = marker[1];
      fenceDepth = depth;
      fences.push({ index, language: marker[2].trim().split(/\s+/)[0] });
      return '';
    });
}

function headingSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

function linkTargets(lines) {
  return [...lines.join('\n').matchAll(/\]\(([^)\s]+)\)/g)].map((match) => match[1]);
}

function checkReadme(markdown, label = 'README') {
  checkDocumentationOwnership(markdown, label);
  const fences = [];
  const lines = proseLines(markdown, fences);
  const sections = lines.flatMap((line, index) => {
    const match = /^## (.+)$/.exec(line);
    return match ? [{ title: match[1], index }] : [];
  });
  const titles = sections.map(({ title }) => title);
  const check = (condition, message) => assert.ok(condition, label + ': ' + message);
  const template = /(?:^|[/\\])README\.template\.md$/.test(label);
  check(lines.filter((line) => /^# \S/.test(line)).length === 1, 'use exactly one project title');
  for (const heading of required) {
    check(titles.includes(heading), 'missing section heading ' + heading);
  }
  let previous = -1;
  for (const title of titles) {
    const index = order.indexOf(title);
    if (index < 0) {
      const equivalent = order.some((heading) => heading.toLowerCase() === title.toLowerCase());
      check(
        !equivalent && !['Behavior', 'License', 'API reference'].includes(title),
        'nonstandard section heading ' + title
      );
      continue;
    }
    check(index > previous, 'duplicate or out-of-order section heading ' + title);
    previous = index;
  }
  const tasks = sections.findIndex(({ title }) => title === 'Common tasks');
  if (tasks >= 0) {
    check(sections[tasks - 1]?.title === 'Usage', 'Common tasks must immediately follow Usage');
  }
  const behaviour = sections.findIndex(({ title }) => title === 'Behaviour');
  if (behaviour >= 0) {
    const start = sections[behaviour].index;
    const end = sections[behaviour + 1]?.index ?? lines.length;
    check(
      !fences.some(
        ({ index, language }) =>
          index > start && index < end && /^(?:javascript|js|typescript|ts|html)$/i.test(language)
      ),
      'Behaviour must link to executable examples in Common tasks or the full reference'
    );
  }
  const contents = sections.findIndex(({ title }) => title === 'Contents');
  const contentsLines = lines.slice(sections[contents].index + 1, sections[contents + 1].index);
  const opening = lines.slice(0, sections[contents].index).filter((line) => line.trim());
  check(
    opening.at(-1) === '**[View full API documentation](docs/API.md)**',
    'opening API link must use the shared label and destination immediately before Contents'
  );
  const version = opening.findIndex((line) => /^- \*\*Version:\*\* \[[^\]]+\]\(CHANGELOG\.md\)$/.test(line));
  const licenceLink = opening[version + 1];
  const templateLicence = template && licenceLink === '- **Licence:** [{{LICENSE}}](LICENSE.md)';
  check(
    version >= 0 && (licenceLink === '- **Licence:** [MIT](LICENSE.md)' || templateLicence),
    'project information must list the linked Version and Licence in order'
  );
  const contentsTargets = linkTargets(contentsLines);
  if (!template || !contentsLines.includes('{{TOC}}')) {
    if (tasks >= 0) {
      check(
        contentsTargets.filter((target) => target === '#common-tasks').length === 1 &&
          contentsLines.includes('- [Common tasks](#common-tasks)'),
        'Contents must have exactly one Common tasks entry'
      );
    }
    check(
      contentsTargets.filter((target) => target === '#api-summary').length === 1 &&
        contentsLines.includes('- [API summary](#api-summary)'),
      'Contents must have exactly one API summary entry'
    );
  }
  const licence = sections.find(({ title }) => title === 'Licence').index;
  const summary = sections.findIndex(({ title }) => title === 'API summary');
  const summaryLines = lines.slice(sections[summary].index + 1, sections[summary + 1].index);
  const [intro, navigation] = summaryLines
    .join('\n')
    .trimStart()
    .split(/\n\s*\n/, 2);
  check(
    intro.replace(/\s+/g, ' ') ===
      'See the **[full API documentation](docs/API.md)** for parameters, return values, errors and examples.',
    'API summary must open with the shared reference sentence'
  );
  const propertyHeader = '| API | Description |';
  const tableHeadings = [];
  let precedingLine = '';
  let propertyTable = false;
  for (const line of summaryLines) {
    if (line === propertyHeader || line === '| API | Description | Returns |') {
      tableHeadings.push(precedingLine);
      propertyTable = line === propertyHeader;
    } else if (!line.startsWith('|')) {
      propertyTable = false;
    } else if (propertyTable) {
      const cells = line
        .split(/(?<!\\)\|/)
        .slice(1, -1)
        .map((cell) => cell.trim());
      check(cells.length === 2, 'property table row width must match its header');
      if (!cells.every((cell) => /^:?-+:?$/.test(cell))) {
        const signature = /^\[`([^`]+)`\]\(/.exec(cells[0])?.[1];
        check(signature, 'property table rows need a linked property or constant name');
        check(!signature.includes('('), 'callable API rows require a Returns column');
      }
    }
    if (line.trim()) {
      precedingLine = line;
    }
  }
  if (tableHeadings.length > 1) {
    check(
      tableHeadings.every((heading) => /^### \S/.test(heading)),
      'each API table needs an H3 group heading'
    );
    const groups = tableHeadings.map((heading) => heading.slice(4));
    const anchors = groups.map((group) => '#' + headingSlug(group));
    const pageAnchors = lines.flatMap((line) => {
      const heading = /^#{1,6} (.+)$/.exec(line);
      return heading ? ['#' + headingSlug(heading[1])] : [];
    });
    check(
      anchors.every((anchor) => pageAnchors.filter((candidate) => candidate === anchor).length === 1),
      'API group headings must have unique anchors'
    );
    check(
      navigation === groups.map((group, index) => `[${group}](${anchors[index]})`).join(' · '),
      'API group jump links must follow the reference sentence and target every local group heading in order'
    );
    check(
      anchors.every((anchor) => !contentsTargets.includes(anchor)),
      'Contents must omit API group entries'
    );
  }
  const licenceSentence = lines.slice(licence + 1).find((line) => line.trim());
  check(
    licenceSentence === 'Licensed under the [MIT licence](LICENSE.md).' ||
      (template && licenceSentence === 'Licensed under the [{{LICENSE}} licence](LICENSE.md).'),
    'Licence sentence must be “Licensed under the [MIT licence](LICENSE.md).”'
  );
}

function checkReadmeFile(file) {
  const markdown = fs.readFileSync(file, 'utf8');
  checkReadme(markdown, file);
  return markdown;
}

function checkContributorLink(file) {
  const targets = linkTargets(proseLines(checkReadmeFile(file)));
  assert.ok(
    targets.some((target) =>
      /^https:\/\/github\.com\/[^/]+\/[^/]+\/blob\/[^/#]+\/CONTRIBUTING\.md(?:#.*)?$/.test(target)
    ),
    file + ': link to root CONTRIBUTING.md in the repository'
  );
}

function checkRepository(root) {
  const ownership = checkOwnership(root);
  const guide = path.join(root, 'CONTRIBUTING.md');
  assert.ok(fs.statSync(guide, { throwIfNoEntry: false })?.isFile(), root + ': missing root CONTRIBUTING.md');
  const copy = path.join(root, 'scripts', 'lib', 'check-library-readme.cjs');
  assert.ok(
    fs.existsSync(copy) &&
      fs.readFileSync(copy, 'utf8').replace(/\r\n/g, '\n') ===
        fs.readFileSync(require.resolve('./check-library-readme.cjs'), 'utf8').replace(/\r\n/g, '\n'),
    root + ': missing or stale copy of the shared README checker'
  );
  checkContributorLink(path.join(root, 'README.md'));
  const template = path.join(root, 'scripts', 'README.template.md');
  if (fs.existsSync(template)) {
    checkContributorLink(template);
  }

  const agents = path.join(root, 'AGENTS.md');
  if (!fs.existsSync(agents)) {
    return ownership;
  }
  const targets = linkTargets(proseLines(fs.readFileSync(agents, 'utf8')));
  assert.ok(
    targets.some((target) => /^(?:\.\/)?CONTRIBUTING\.md(?:#.*)?$/.test(target)),
    agents + ': link to root CONTRIBUTING.md'
  );
  for (const target of targets) {
    if (/^(?:https?:|mailto:)/.test(target)) {
      continue;
    }
    const [file, fragment] = target.split('#');
    const destination = path.resolve(root, file || 'AGENTS.md');
    assert.ok(fs.existsSync(destination), agents + ': missing linked file ' + target);
    if (fragment) {
      const headings = proseLines(fs.readFileSync(destination, 'utf8')).filter((line) => /^#{1,6} /.test(line));
      assert.ok(
        headings.some((heading) => headingSlug(heading.replace(/^#+ /, '')) === fragment),
        agents + ': missing linked heading ' + target
      );
    }
  }

  return ownership;
}

function checkPackage(root) {
  checkOwnership(root, { git: false });
  checkContributorLink(path.join(root, 'README.md'));
  for (const file of ['CONTRIBUTING.md', 'AGENTS.md']) {
    assert.ok(!fs.existsSync(path.join(root, file)), root + ': ' + file + ' must stay in the source repository');
  }
}

module.exports = checkReadme;
module.exports.checkRepository = checkRepository;
module.exports.checkPackage = checkPackage;
module.exports.checkOwnership = checkOwnership;

if (require.main === module) {
  const args = process.argv.slice(2);
  const mode = args[0];
  const check =
    mode === '--ownership'
      ? checkOwnership
      : mode === '--repository'
        ? checkRepository
        : mode === '--package'
          ? checkPackage
          : checkReadmeFile;
  const inputs = check === checkReadmeFile ? args : args.slice(1);
  assert.ok(inputs.length, 'Usage: node check-library-readme.cjs [--ownership|--repository|--package] <path> [...]');
  for (const input of inputs) {
    const result = check(input);
    if (result?.git === 'unavailable') {
      process.stdout.write(input + ': Git remotes not checked (no local .git).\n');
    } else if (result?.git === 'no remotes') {
      process.stdout.write(input + ': Git remote ownership unverified (no configured remotes).\n');
    }
  }
  process.stdout.write('Shared documentation consistency checks passed for ' + inputs.length + ' input(s).\n');
}

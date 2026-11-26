import stylistic from '@stylistic/eslint-plugin';
import jsdoc from 'eslint-plugin-jsdoc';

// An upstream gap after a trailing next-line directive changes its target.
// Move only that whitespace gap before the whole trailing comment chain.
// Counted coverage spans must keep their physical lines; unsafe fixes stay
// reported for explicit author reconciliation rather than changing coverage.
function preserveDirectiveTargets(rule) {
  return {
    ...rule,
    create(context) {
      const source = context.sourceCode;
      const coverageSpans = source.getAllComments().flatMap((comment) => {
        const match = /^\s*(?:node:coverage|c8|v8)\s+ignore\s+next(?:\s+(\d+))?\b/u.exec(comment.value);

        if (!match) {
          return [];
        }

        const count = match[1] === undefined ? 1 : Number(match[1]);

        return [{ end: comment.range[1], lastLine: comment.loc.end.line + count }];
      });
      const changesCoverageSpan = (fix) => {
        const removed = source.text.slice(fix.range[0], fix.range[1]);
        const lines = (value) => (value.match(/\r\n|[\r\n\u2028\u2029]/gu) || []).length;

        if (lines(fix.text) === lines(removed)) {
          return false;
        }

        const line = source.getLocFromIndex(fix.range[0]).line;

        return coverageSpans.some((span) => fix.range[0] >= span.end && line < span.lastLine);
      };

      const guarded = Object.create(context, {
        report: {
          value(descriptor) {
            if (!descriptor.fix) {
              context.report(descriptor);

              return;
            }

            context.report({
              ...descriptor,
              fix(fixer) {
                const fix = descriptor.fix(fixer);

                if (!fix || changesCoverageSpan(fix)) {
                  return null;
                }

                if (descriptor.messageId !== 'expectedBlankLine') {
                  return fix;
                }

                const comments = source.getCommentsBefore(descriptor.node);
                const directive = comments.find((comment) =>
                  /^\s*(?:eslint-disable-next-line\b|@ts-(?:expect-error|ignore)\b)/u.test(comment.value)
                );

                if (!directive || fix.range[0] !== fix.range[1] || !/^\s+$/u.test(fix.text)) {
                  return fix;
                }

                const first = comments[0];
                const previous = source.getTokenBefore(first);
                const last = comments[comments.length - 1];

                if (
                  !previous ||
                  previous.loc.end.line !== first.loc.start.line ||
                  fix.range[0] !== last.range[1] ||
                  directive.loc.end.line !== descriptor.node.loc.start.line - 1
                ) {
                  return fix;
                }

                const indent = source.lines[descriptor.node.loc.start.line - 1].match(/^\s*/u)[0];

                return fixer.replaceTextRange([previous.range[1], first.range[0]], '\n\n' + indent);
              }
            });
          }
        }
      });

      return rule.create(guarded);
    }
  };
}

const safeStylistic = {
  ...stylistic,
  rules: {
    ...stylistic.rules,
    'padding-line-between-statements': preserveDirectiveTargets(stylistic.rules['padding-line-between-statements'])
  }
};

const safeJsdoc = {
  ...jsdoc,
  rules: {
    ...jsdoc.rules,
    'lines-before-block': preserveDirectiveTargets(jsdoc.rules['lines-before-block'])
  }
};

export const readabilityPlugins = { '@stylistic': safeStylistic, jsdoc: safeJsdoc };

export const readabilityRules = {
  'jsdoc/lines-before-block': [
    'error',
    {
      lines: 1,
      checkBlockStarts: false,
      ignoreSameLine: true,
      ignoreSingleLines: false,
      excludedTags: []
    }
  ],
  '@stylistic/padding-line-between-statements': [
    'error',
    { blankLine: 'always', prev: ['const', 'let', 'var'], next: '*' },
    { blankLine: 'any', prev: ['const', 'let', 'var'], next: ['const', 'let', 'var'] },
    { blankLine: 'always', prev: 'directive', next: '*' },
    { blankLine: 'any', prev: 'directive', next: 'directive' },
    { blankLine: 'always', prev: 'block-like', next: '*' },
    { blankLine: 'always', prev: '*', next: 'return' }
  ]
};

// Only these reviewed whitespace fixes belong in the formatting workflow.
export const readabilityFixRuleIds = Object.freeze(Object.keys(readabilityRules));

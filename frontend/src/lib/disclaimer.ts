/**
 * The disclaimer, written once.
 *
 * It has to appear in four renderers — the two document components and the two
 * markdown exports — plus both download bars. Four copies of a legal notice is
 * four chances for one of them to be edited and the others not, so the wording
 * lives here and every renderer imports it.
 *
 * It goes *inside* the document rather than only in the app chrome, because the
 * app chrome is `print:hidden` and the whole point is that it survives into what
 * the user takes away. It sits immediately before the Common Paper attribution
 * and never in place of it: `templates/README.md` requires the CC BY credit to
 * travel with anything generated from those templates, so the attribution stays
 * last and stays intact.
 *
 * It is also deliberately not phrased as part of the agreement. It names
 * Prelegal, so a reader can see it is the tool speaking and not a clause
 * somebody agreed to.
 */

export const DISCLAIMER_HEADING = "Prelegal notice — not legal advice";

export const DISCLAIMER_BODY =
  "This document is a draft generated from a Common Paper template. It has " +
  "not been reviewed by a lawyer and is subject to legal review before it is " +
  "signed or relied on.";

/** The one-line form, for the app's own chrome where space is short. */
export const DRAFT_REVIEW_NOTE =
  "This is a draft and should be reviewed by a lawyer before signing.";

/**
 * The disclaimer as markdown blocks, for both exports.
 *
 * Returned as separate blocks rather than one string so each export can join
 * them the way it already joins everything else — the Mutual NDA's export
 * separates blocks with a blank line, the generic one emits a line at a time.
 */
export const DISCLAIMER_MARKDOWN: readonly string[] = [
  `**${DISCLAIMER_HEADING}**`,
  DISCLAIMER_BODY,
];

"""Which values a Common Paper agreement leaves to be filled in.

Every deal-specific value in the Standard Terms is wrapped in a span whose class
names the exhibit it belongs to — `coverpage_link`, `keyterms_link`,
`orderform_link`, and so on. Reading those spans is how the field set is known
without a cover page having been published for the agreement.

Every class is scanned, never only the one an agreement is nominally filed
under. The SLA mixes `orderform_link` and `coverpage_link` in a single file, so
filtering by a declared tier would silently drop half of its fields.

This is a deliberate second implementation of what `frontend/scripts/
document-parser.mjs` does in Node, and it is the narrower half: the frontend
parses the clause tree because it renders the agreement, while this only needs
the set of names. The alternative — having the backend read an artefact the
frontend build produces — would make the chat endpoint, and every test of it,
depend on `npm run build` having run. The two are held together by
`tests/test_document_specs.py`, which checks both against the same templates.
"""

import re

#: The exhibits Common Paper splits deal terms across. A value belongs to
#: exactly one of them, and an agreement may use several.
FIELD_SPAN_CLASSES = ("coverpage", "keyterms", "orderform", "businessterms", "sow")

_FIELD_SPAN = re.compile(
    r'<span class="(?:' + "|".join(FIELD_SPAN_CLASSES) + r')_link"[^>]*>(.+?)</span>'
)

#: Straight and curly apostrophes both occur upstream.
_POSSESSIVE = re.compile(r"['’]s$")


def normalise_field_name(raw: str) -> str:
    """Collapse a span's text to the value it names.

    The templates inflect these in running prose, so `Provider` and `Provider's`
    are one value. Without this the AI Addendum would look like it had seven
    fields rather than six, and no overlay could ever match it.
    """
    return _POSSESSIVE.sub("", raw.strip()).strip()


def derive_field_names(markdown: str) -> list[str]:
    """Every distinct value the Standard Terms substitute, in first-use order.

    Scanning the raw markdown rather than a parsed tree is what makes this
    immune to a field nested inside a bold run — which does occur, in the Pilot
    Agreement's liability cap, and which cost the frontend tokenizer a bug.
    """
    seen: list[str] = []
    for match in _FIELD_SPAN.finditer(markdown):
        name = normalise_field_name(match.group(1))
        if name and name not in seen:
            seen.append(name)
    return seen
